import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CursorReader } from "../cursor-reader.js";
import type { SourceSnapshot } from "../types.js";
import { mapCursorAgent } from "./cursor-map.js";

function cursorInstallRoot(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Cursor");
}

function classifyCursorError(message: string): { status: "error" | "missing"; detail: string } {
  const lower = message.toLowerCase();
  if (
    lower.includes("node:sqlite") ||
    lower.includes("cannot find module") ||
    lower.includes("unknown built-in") ||
    (lower.includes("enoent") && lower.includes("node"))
  ) {
    return {
      status: "error",
      detail: "Node 22.5+ necessário no PATH para ler o Cursor",
    };
  }
  if (lower.includes("locked") || lower.includes("busy") || lower.includes("sqlite")) {
    return {
      status: "error",
      detail: "Banco do Cursor ocupado ou inacessível",
    };
  }
  if (
    lower.includes("enoent") &&
    (lower.includes("cursor") || lower.includes("state.vscdb") || lower.includes("read-agents"))
  ) {
    return { status: "missing", detail: "Cursor não instalado" };
  }
  return { status: "error", detail: message.slice(0, 180) };
}

export class CursorSource {
  private readonly reader = new CursorReader();

  dispose(): void {
    this.reader.dispose();
  }

  async read(): Promise<SourceSnapshot> {
    if (!fs.existsSync(cursorInstallRoot())) {
      return {
        source: "cursor",
        health: { status: "missing", detail: "Cursor não instalado" },
        agents: [],
        liveProcessCount: 0,
      };
    }

    try {
      const raw = await this.reader.getActiveAgents();
      return {
        source: "cursor",
        health: { status: "ok" },
        agents: raw.map(mapCursorAgent),
        liveProcessCount: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao ler o Cursor";
      return {
        source: "cursor",
        health: classifyCursorError(message),
        agents: [],
        liveProcessCount: 0,
      };
    }
  }
}
