import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentSnapshot, SourceSnapshot } from "../types.js";
import { childEnv, which } from "../which.js";

const execFileAsync = promisify(execFile);

interface ClaudeAgentJson {
  id?: string;
  sessionId?: string;
  name?: string;
  cwd?: string;
  kind?: string;
  startedAt?: number;
  state?: string;
  status?: string;
  waitingFor?: string;
  pid?: number;
}

type ClaudeCapability = "unknown" | "ok" | "outdated" | "missing";

function isClaudeActive(row: ClaudeAgentJson): boolean {
  if (row.waitingFor) return true;
  const state = (row.state ?? "").toLowerCase();
  const status = (row.status ?? "").toLowerCase();
  if (state === "blocked" || status === "waiting" || status === "needs_input") return true;
  if (state === "working" || status === "active") return true;
  if (state === "idle" || state === "done" || state === "failed" || state === "stopped") {
    return false;
  }
  return Boolean(row.pid);
}

function mapClaudeAgent(row: ClaudeAgentJson): AgentSnapshot {
  const blocked =
    Boolean(row.waitingFor) ||
    row.state === "blocked" ||
    row.status === "waiting" ||
    row.status === "needs_input";
  const id = row.id ?? row.sessionId ?? `${row.cwd ?? "claude"}-${row.startedAt ?? 0}`;

  return {
    source: "claude",
    id,
    composerId: id,
    workspaceId: "",
    workspacePath: row.cwd ?? null,
    name: row.name?.trim() || (row.kind === "background" ? "Sessão em background" : "Sessão Claude"),
    subtitle: row.waitingFor
      ? `Aguardando: ${row.waitingFor}`
      : row.state || row.status || "Claude Code",
    contextUsagePercent: null,
    isRunning: !blocked && (row.state === "working" || row.status === "active" || Boolean(row.pid)),
    isSubagent: false,
    parentComposerId: null,
    hasBlockingPendingActions: blocked,
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0,
  };
}

function parseClaudeJson(stdout: string): ClaudeAgentJson[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("claude agents --json não devolveu uma lista");
  }
  return parsed as ClaudeAgentJson[];
}

export class ClaudeSource {
  private capability: ClaudeCapability = "unknown";
  private binary: string | null = null;
  private nextProbeAt = 0;
  private inFlight: Promise<SourceSnapshot> | null = null;
  private lastOk: SourceSnapshot | null = null;
  private lastOkAt = 0;

  read(): Promise<SourceSnapshot> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.readOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async readOnce(): Promise<SourceSnapshot> {
    const now = Date.now();
    if (this.lastOk && now - this.lastOkAt < 4_000) {
      return this.lastOk;
    }
    if (this.capability !== "ok" && now < this.nextProbeAt) {
      return this.cachedFailure();
    }

    if (!this.binary) {
      this.binary = await which("claude");
    }

    if (!this.binary) {
      this.capability = "missing";
      this.nextProbeAt = now + 30_000;
      return {
        source: "claude",
        health: { status: "missing", detail: "Claude Code não está no PATH" },
        agents: [],
        liveProcessCount: 0,
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        this.binary,
        ["agents", "--json"],
        {
          windowsHide: true,
          timeout: 8000,
          maxBuffer: 4 * 1024 * 1024,
          env: childEnv(),
        },
      );

      const combined = `${stderr ?? ""}\n${stdout ?? ""}`;
      if (/unknown option '--json'/i.test(combined) || /unknown command/i.test(combined)) {
        this.capability = "outdated";
        this.nextProbeAt = now + 60_000;
        return {
          source: "claude",
          health: {
            status: "outdated",
            detail: "Atualize o Claude Code para ter claude agents --json",
          },
          agents: [],
          liveProcessCount: 0,
        };
      }

      this.capability = "ok";
      const rows = parseClaudeJson(stdout);
      const agents = rows.filter(isClaudeActive).map(mapClaudeAgent);
      const snapshot: SourceSnapshot = {
        source: "claude",
        health: { status: "ok" },
        agents,
        liveProcessCount: 0,
      };
      this.lastOk = snapshot;
      this.lastOkAt = now;
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stderr =
        error && typeof error === "object" && "stderr" in error
          ? String(error.stderr)
          : "";
      const blob = `${message}\n${stderr}`;

      if (/unknown option '--json'/i.test(blob)) {
        this.capability = "outdated";
        this.nextProbeAt = now + 60_000;
        return {
          source: "claude",
          health: {
            status: "outdated",
            detail: "Atualize o Claude Code para ter claude agents --json",
          },
          agents: [],
          liveProcessCount: 0,
        };
      }

      if (/enoent/i.test(blob)) {
        this.binary = null;
        this.capability = "missing";
        this.nextProbeAt = now + 30_000;
        return {
          source: "claude",
          health: { status: "missing", detail: "Claude Code não está no PATH" },
          agents: [],
          liveProcessCount: 0,
        };
      }

      return {
        source: "claude",
        health: { status: "error", detail: message.slice(0, 180) },
        agents: [],
        liveProcessCount: 0,
      };
    }
  }

  private cachedFailure(): SourceSnapshot {
    if (this.capability === "missing") {
      return {
        source: "claude",
        health: { status: "missing", detail: "Claude Code não está no PATH" },
        agents: [],
        liveProcessCount: 0,
      };
    }
    return {
      source: "claude",
      health: {
        status: "outdated",
        detail: "Atualize o Claude Code para ter claude agents --json",
      },
      agents: [],
      liveProcessCount: 0,
    };
  }
}
