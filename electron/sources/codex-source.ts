import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SourceAgentSnapshot, SourceSnapshot } from "../types.js";
import { childEnv } from "../which.js";

const execFileAsync = promisify(execFile);
const CODEX_CMD =
  /(?:^|[\\/\s"])codex(?:\.cmd|\.exe)?(?:\s|$|")|@openai[\\/]codex/i;
const ACTIVE_SESSION_LOOKBACK_MS = 2 * 60 * 1000;

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
  };
}

interface WmiProcess {
  Name?: string;
  CommandLine?: string | null;
}

function isCodexProcess(name: string, commandLine: string): boolean {
  if (/electron/i.test(commandLine) || /side-notch/i.test(commandLine)) return false;
  if (/^codex(\.exe)?$/i.test(name)) return true;
  return CODEX_CMD.test(commandLine);
}

function parseProcessList(stdout: string): WmiProcess[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as WmiProcess | WmiProcess[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

export class CodexSource {
  private inFlight: Promise<SourceSnapshot> | null = null;

  read(): Promise<SourceSnapshot> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.readOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async readOnce(): Promise<SourceSnapshot> {
    const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
    if (!fs.existsSync(codexHome)) {
      return {
        source: "codex",
        health: { status: "missing", detail: "Estado local do Codex nao encontrado" },
        agents: [],
        liveProcessCount: 0,
      };
    }

    try {
      const agents = this.readActiveSessions(codexHome);
      let liveProcessCount = 0;

      // Process enumeration can be denied by Windows policy. Session locks remain usable.
      try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_Process -Filter \"Name='node.exe' OR Name='codex.exe'\" | Select-Object Name,CommandLine | ConvertTo-Json -Compress",
        ],
        { windowsHide: true, timeout: 5000, maxBuffer: 8 * 1024 * 1024, env: childEnv() },
      );

      const processes = parseProcessList(stdout);
      liveProcessCount = processes.filter((proc) =>
        isCodexProcess(proc.Name ?? "", proc.CommandLine ?? ""),
      ).length;
      } catch {
        liveProcessCount = 0;
      }

      return {
        source: "codex",
        health: { status: "ok" },
        agents,
        liveProcessCount,
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

  private readActiveSessions(codexHome: string): SourceAgentSnapshot[] {
    const sessionsDir = path.join(codexHome, "sessions");
    if (!fs.existsSync(sessionsDir)) return [];

    const names = this.readSessionNames(path.join(codexHome, "session_index.jsonl"));
    const lockedSessionIds = this.readLockedSessionIds(codexHome);
    const newestAllowed = Date.now() - ACTIVE_SESSION_LOOKBACK_MS;
    const files = fs
      .readdirSync(sessionsDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .map((file) => ({ file, stat: fs.statSync(file) }))
      .filter(({ file, stat }) => {
        const id = this.sessionIdFromFile(file);
        return stat.mtimeMs >= newestAllowed || (id != null && lockedSessionIds.has(id));
      })
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    const agents: SourceAgentSnapshot[] = [];
    for (const { file } of files) {
      const session = this.readSession(file);
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
        // Token events are cumulative request usage, not current context consumption.
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

  private readLockedSessionIds(codexHome: string): Set<string> {
    const locksDir = path.join(codexHome, "thread-writer-locks");
    if (!fs.existsSync(locksDir)) return new Set();
    return new Set(
      fs
        .readdirSync(locksDir)
        .map((name) => name.match(/^([0-9a-f-]{36})\.lock$/i)?.[1])
        .filter((id): id is string => Boolean(id)),
    );
  }

  private sessionIdFromFile(file: string): string | null {
    return path.basename(file).match(/([0-9a-f-]{36})\.jsonl$/i)?.[1] ?? null;
  }

  private readSessionNames(indexPath: string): Map<string, string> {
    const names = new Map<string, string>();
    if (!fs.existsSync(indexPath)) return names;
    for (const line of fs.readFileSync(indexPath, "utf8").split(/\r?\n/)) {
      try {
        const row = JSON.parse(line) as SessionIndexEntry;
        if (row.id && row.thread_name?.trim()) names.set(row.id, row.thread_name.trim());
      } catch {
        // The index can end with a partially written JSON line.
      }
    }
    return names;
  }

  private readSession(file: string): {
    id: string | null;
    cwd: string | null;
    active: boolean;
  } | null {
    let meta: SessionMeta | null = null;
    let active = false;

    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line) continue;
      try {
        const row = JSON.parse(line) as SessionEvent;
        if (row.type === "session_meta") meta = row.payload as SessionMeta;
        if (row.type === "event_msg" && row.payload?.type === "task_started") active = true;
        if (row.type === "event_msg" && row.payload?.type === "task_complete") active = false;

      } catch {
        // Codex appends JSONL while this reader is polling; ignore the unfinished line.
      }
    }

    return {
      id: meta?.session_id ?? meta?.id ?? null,
      cwd: meta?.cwd ?? null,
      active,
    };
  }
}
