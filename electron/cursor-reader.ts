import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { RawCursorAgent } from "./sources/cursor-map.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findProjectRoot(startDir: string): string {
  let current = startDir;

  for (let depth = 0; depth < 8; depth += 1) {
    const packageJson = path.join(current, "package.json");
    const script = path.join(current, "scripts", "read-agents.mjs");
    if (fs.existsSync(packageJson) && fs.existsSync(script)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error(`Could not locate project root from ${startDir}`);
}

function isInsideAsarArchive(filePath: string): boolean {
  return /app\.asar([\\/]|$)/i.test(filePath) && !/app\.asar\.unpacked/i.test(filePath);
}

function resolveReadAgentsScript(): string {
  const root = findProjectRoot(__dirname);
  const unpacked = root.replace(/app\.asar$/i, "app.asar.unpacked");
  const candidates = [
    path.join(unpacked, "scripts", "read-agents.mjs"),
    path.join(root, "scripts", "read-agents.mjs"),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    // External Node cannot read or execute files inside an asar archive.
    if (isInsideAsarArchive(candidate)) continue;
    return candidate;
  }

  throw new Error(`Missing reader script. Looked in: ${candidates.join(", ")}`);
}

function resolveNodeBinary(): string {
  const candidates = [
    process.env.SIDE_NOTCH_NODE,
    process.env.npm_node_execpath,
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs", "node.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "nodejs", "node.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "nodejs", "node.exe"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate.endsWith("electron.exe")) continue;
    if (fs.existsSync(candidate)) return candidate;
  }

  return "node";
}

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  delete env.ELECTRON_OVERRIDE_DIST_PATH;
  delete env.NODE_OPTIONS;
  env.FORCE_COLOR = "0";
  return env;
}

function extractJson(stdout: string): RawCursorAgent[] {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as RawCursorAgent[];
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as RawCursorAgent[];
    }
    throw new Error(`Reader returned non-JSON output: ${trimmed.slice(0, 240)}`);
  }
}

export class CursorReader {
  private readonly readAgentsScript: string;
  private readonly nodeBinary: string;
  private inFlight: Promise<RawCursorAgent[]> | null = null;
  private loggedOnce = false;
  private loggedCapture = false;

  constructor() {
    this.readAgentsScript = resolveReadAgentsScript();
    this.nodeBinary = resolveNodeBinary();
  }

  getActiveAgents(): Promise<RawCursorAgent[]> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.readOnce().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async readOnce(): Promise<RawCursorAgent[]> {
    if (!this.loggedOnce) {
      this.loggedOnce = true;
      console.log("[side-notch] reader", this.nodeBinary, this.readAgentsScript);
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        this.nodeBinary,
        [this.readAgentsScript],
        {
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 8000,
          env: childEnv(),
        },
      );

      if (stderr?.trim()) {
        console.warn("[side-notch] reader stderr:", stderr.trim().slice(0, 500));
      }

      const agents = extractJson(stdout);
      if (!this.loggedCapture) {
        this.loggedCapture = true;
        console.log(
          `[side-notch] captured ${agents.length} agent(s)`,
          agents.map((a) => `${a.name}:${Math.round(a.contextUsagePercent)}%`).join(", ") || "(none)",
        );
      }
      return agents;
    } catch (error) {
      const details =
        error && typeof error === "object" && "stderr" in error
          ? String(error.stderr).trim()
          : "";
      const message = error instanceof Error ? error.message : "Failed to read Cursor agents";
      throw new Error(details ? `${message}: ${details}` : message);
    }
  }
}
