import type { SourceSnapshot } from "../types.js";
import { ClaudeSource } from "./claude-source.js";
import { CodexSource } from "./codex-source.js";
import { CursorSource } from "./cursor-source.js";

export class SourceHub {
  private readonly cursor = new CursorSource();
  private readonly claude = new ClaudeSource();
  private readonly codex = new CodexSource();

  async collect(): Promise<SourceSnapshot[]> {
    const [cursor, claude, codex] = await Promise.all([
      this.cursor.read(),
      this.claude.read(),
      this.codex.read(),
    ]);
    return [cursor, claude, codex];
  }
}
