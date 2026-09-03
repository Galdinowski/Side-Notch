import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentSnapshot, SourceSnapshot } from "../types.js";

const ACTIVE_SESSION_LOOKBACK_MS = 2 * 60 * 1000;
const LOCK_ID = /^([0-9a-f-]{36})\.lock$/i;

interface SessionIndexEntry {
  id?: string;
  thread_name?: string;
}

interface SessionMeta {
  session_id?: string;
  id?: string;
  cwd?: string;
}

interface SessionEvent {
  type?: string;
  payload?: {
    type?: string;
    session_id?: string;
    id?: string;
    cwd?: string;
  };
}

export interface SessionFileState {
  mtimeMs: number;
  size: number;
  id: string | null;
  cwd: string | null;
  active: boolean;
  pending: string;
}

interface IndexCache {
  path: string;
  mtimeMs: number;
  size: number;
  names: Map<string, string>;
}

function defaultCodexHome(): string {
  return process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
}

export function applyJsonlChunk(chunk: string, state: SessionFileState): void {
  const text = state.pending + chunk;
  const lines = text.split(/\r?\n/);
  state.pending = lines.pop() ?? "";

  for (const line of lines) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as SessionEvent;
      if (row.type === "session_meta") {
        const meta = (row.payload ?? {}) as SessionMeta;
        state.id = meta.session_id ?? meta.id ?? state.id;
        state.cwd = meta.cwd ?? state.cwd;
      }
      if (row.type === "event_msg" && row.payload?.type === "task_started") {
        state.active = true;
      }
      if (row.type === "event_msg" && row.payload?.type === "task_complete") {
        state.active = false;
      }
    } catch {
      // Codex appends JSONL while this reader is polling; ignore the unfinished line.
    }
  }
}

function emptySessionState(mtimeMs: number, size: number): SessionFileState {
  return {
    mtimeMs,
    size,
    id: null,
    cwd: null,
    active: false,
    pending: "",
  };
}

export function ingestSessionFile(
  file: string,
  cache: Map<string, SessionFileState>,
): SessionFileState | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    cache.delete(file);
    return null;
  }

  const cached = cache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached;
  }

  if (cached && stat.size > cached.size) {
    const fd = fs.openSync(file, "r");
    try {
      const extra = Buffer.alloc(stat.size - cached.size);
      fs.readSync(fd, extra, 0, extra.length, cached.size);
      applyJsonlChunk(extra.toString("utf8"), cached);
    } finally {
      fs.closeSync(fd);
    }
    cached.mtimeMs = stat.mtimeMs;
    cached.size = stat.size;
    return cached;
  }

  const next = emptySessionState(stat.mtimeMs, stat.size);
  applyJsonlChunk(fs.readFileSync(file, "utf8"), next);
  cache.set(file, next);
  return next;
}

export function sessionIdFromFile(file: string): string | null {
  return path.basename(file).match(/([0-9a-f-]{36})\.jsonl$/i)?.[1] ?? null;
}

export function readLockedSessionIds(codexHome: string): Set<string> {
  const locksDir = path.join(codexHome, "thread-writer-locks");
  if (!fs.existsSync(locksDir)) return new Set();
  return new Set(
    fs
      .readdirSync(locksDir)
      .map((name) => name.match(LOCK_ID)?.[1])
      .filter((id): id is string => Boolean(id)),
  );
}

export class CodexSource {
  private inFlight: Promise<SourceSnapshot> | null = null;
  private readonly sessionCache = new Map<string, SessionFileState>();
  private indexCache: IndexCache | null = null;
  private readonly home: string;

  constructor(home = defaultCodexHome()) {
    this.home = home;
  }

  read(): Promise<SourceSnapshot> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.readOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async readOnce(): Promise<SourceSnapshot> {
    if (!fs.existsSync(this.home)) {
      return {
        source: "codex",
        health: { status: "missing", detail: "Estado local do Codex nao encontrado" },
        agents: [],
        liveProcessCount: 0,
      };
    }

    try {
      const lockedSessionIds = readLockedSessionIds(this.home);
      const agents = this.readActiveSessions(lockedSessionIds);
      return {
        source: "codex",
        health: { status: "ok" },
        agents,
        liveProcessCount: agents.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao ler o Codex";
      return {
        source: "codex",
        health: { status: "error", detail: message.slice(0, 180) },
        agents: [],
        liveProcessCount: 0,
      };
    }
  }

  private readActiveSessions(lockedSessionIds: Set<string>): AgentSnapshot[] {
    const sessionsDir = path.join(this.home, "sessions");
    if (!fs.existsSync(sessionsDir)) {
      this.sessionCache.clear();
      return [];
    }

    const names = this.readSessionNames(path.join(this.home, "session_index.jsonl"));
    const newestAllowed = Date.now() - ACTIVE_SESSION_LOOKBACK_MS;
    const files = fs
      .readdirSync(sessionsDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .map((file) => ({ file, stat: fs.statSync(file) }))
      .filter(({ file, stat }) => {
        const id = sessionIdFromFile(file);
        return stat.mtimeMs >= newestAllowed || (id != null && lockedSessionIds.has(id));
      })
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    const keep = new Set(files.map(({ file }) => file));
    for (const key of [...this.sessionCache.keys()]) {
      if (!keep.has(key)) this.sessionCache.delete(key);
    }

    const agents: AgentSnapshot[] = [];
    for (const { file } of files) {
      const session = ingestSessionFile(file, this.sessionCache);
      if (!session?.active || !session.id) continue;

      const name = names.get(session.id) || "Sessao Codex";
      agents.push({
        source: "codex",
        id: session.id,
        composerId: session.id,
        workspaceId: session.cwd ?? "",
        workspacePath: session.cwd ?? null,
        name,
        subtitle: "Executando",
        contextUsagePercent: null,
        isRunning: true,
        isSubagent: false,
        parentComposerId: null,
        hasBlockingPendingActions: false,
        linesAdded: 0,
        linesRemoved: 0,
        filesChanged: 0,
      });
    }
    return agents;
  }

  private readSessionNames(indexPath: string): Map<string, string> {
    if (!fs.existsSync(indexPath)) {
      this.indexCache = null;
      return new Map();
    }

    const stat = fs.statSync(indexPath);
    if (
      this.indexCache &&
      this.indexCache.path === indexPath &&
      this.indexCache.mtimeMs === stat.mtimeMs &&
      this.indexCache.size === stat.size
    ) {
      return this.indexCache.names;
    }

    const names = new Map<string, string>();
    for (const line of fs.readFileSync(indexPath, "utf8").split(/\r?\n/)) {
      try {
        const row = JSON.parse(line) as SessionIndexEntry;
        if (row.id && row.thread_name?.trim()) names.set(row.id, row.thread_name.trim());
      } catch {
        // The index can end with a partially written JSON line.
      }
    }
    this.indexCache = {
      path: indexPath,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      names,
    };
    return names;
  }
}
