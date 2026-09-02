import type { SourceId, SourceSnapshot } from "../types.js";
import { ClaudeSource } from "./claude-source.js";
import { CodexSource } from "./codex-source.js";
import { CursorSource } from "./cursor-source.js";

export const SOURCE_WAIT_MS = {
  cursor: 3000,
  claude: 2500,
  codex: 2500,
} as const;

export function timeoutSnapshot(
  source: SourceId,
  fallback?: SourceSnapshot,
): SourceSnapshot {
  if (fallback) return fallback;
  return {
    source,
    health: { status: "error", detail: "Leitura demorou demais" },
    agents: [],
    liveProcessCount: 0,
  };
}

export async function settleSource(
  source: SourceId,
  read: () => Promise<SourceSnapshot>,
  waitMs: number,
  fallback?: SourceSnapshot,
): Promise<SourceSnapshot> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<SourceSnapshot>((resolve) => {
        timer = setTimeout(() => resolve(timeoutSnapshot(source, fallback)), waitMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class SourceHub {
  private readonly cursor = new CursorSource();
  private readonly claude = new ClaudeSource();
  private readonly codex = new CodexSource();
  private readonly last = new Map<SourceId, SourceSnapshot>();

  dispose(): void {
    this.cursor.dispose();
  }

  async collect(): Promise<SourceSnapshot[]> {
    const [cursor, claude, codex] = await Promise.all([
      this.readOne("cursor", () => this.cursor.read(), SOURCE_WAIT_MS.cursor),
      this.readOne("claude", () => this.claude.read(), SOURCE_WAIT_MS.claude),
      this.readOne("codex", () => this.codex.read(), SOURCE_WAIT_MS.codex),
    ]);
    return [cursor, claude, codex];
  }

  private async readOne(
    source: SourceId,
    read: () => Promise<SourceSnapshot>,
    waitMs: number,
  ): Promise<SourceSnapshot> {
    const snapshot = await settleSource(source, read, waitMs, this.last.get(source));
    this.last.set(source, snapshot);
    return snapshot;
  }
}
