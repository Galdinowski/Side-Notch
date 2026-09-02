import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import type { RawCursorAgent } from "./sources/cursor-map.js";
import { childEnv } from "./which.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REQUEST_TIMEOUT_MS = 8000;

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

function parseAgentsLine(line: string): RawCursorAgent[] {
  const trimmed = line.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`Reader returned non-JSON output: ${trimmed.slice(0, 240)}`);
  }

  if (Array.isArray(parsed)) return parsed as RawCursorAgent[];
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    throw new Error(String(parsed.error));
  }
  throw new Error(`Reader returned non-JSON output: ${trimmed.slice(0, 240)}`);
}

export class CursorReader {
  private readonly readAgentsScript: string;
  private readonly nodeBinary: string;
  private worker: ChildProcessWithoutNullStreams | null = null;
  private lines: readline.Interface | null = null;
  private inFlight: Promise<RawCursorAgent[]> | null = null;
  private loggedOnce = false;
  private loggedCapture = false;
  private disposed = false;

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

  dispose(): void {
    this.disposed = true;
    this.killWorker();
  }

  private async readOnce(): Promise<RawCursorAgent[]> {
    try {
      return await this.requestAgents();
    } catch (error) {
      if (this.disposed) throw error;
      this.killWorker();
      return await this.requestAgents();
    }
  }

  private async requestAgents(): Promise<RawCursorAgent[]> {
    if (!this.loggedOnce) {
      this.loggedOnce = true;
      console.log("[side-notch] reader", this.nodeBinary, this.readAgentsScript);
    }

    const line = await this.requestLine();
    const agents = parseAgentsLine(line);
    if (!this.loggedCapture) {
      this.loggedCapture = true;
      console.log(
        `[side-notch] captured ${agents.length} agent(s)`,
        agents
          .map((agent) => {
            const percent = agent.contextUsagePercent;
            const shown = typeof percent === "number" ? `${Math.round(percent)}%` : "–";
            return `${agent.name}:${shown}`;
          })
          .join(", ") || "(none)",
      );
    }
    return agents;
  }

  private requestLine(): Promise<string> {
    const { worker, lines } = this.ensureWorker();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        this.killWorker();
        reject(new Error("Reader timed out"));
      }, REQUEST_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timer);
        lines.off("line", onLine);
        worker.off("exit", onExit);
        worker.off("error", onError);
      };

      const onLine = (line: string) => {
        cleanup();
        resolve(line);
      };
      const onExit = (code: number | null) => {
        cleanup();
        this.killWorker();
        reject(new Error(`Reader exited (${code ?? "null"})`));
      };
      const onError = (error: Error) => {
        cleanup();
        this.killWorker();
        reject(error);
      };

      lines.once("line", onLine);
      worker.once("exit", onExit);
      worker.once("error", onError);
      worker.stdin.write("\n");
    });
  }

  private ensureWorker(): { worker: ChildProcessWithoutNullStreams; lines: readline.Interface } {
    if (this.disposed) throw new Error("Reader disposed");
    if (this.worker && this.lines && this.worker.exitCode == null && !this.worker.killed) {
      return { worker: this.worker, lines: this.lines };
    }

    this.killWorker();
    const worker = spawn(this.nodeBinary, [this.readAgentsScript, "--stdio"], {
      windowsHide: true,
      env: childEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = readline.createInterface({ input: worker.stdout });
    worker.stderr.on("data", (chunk: Buffer) => {
      const text = String(chunk).trim();
      if (text) console.warn("[side-notch] reader stderr:", text.slice(0, 500));
    });
    const drop = () => {
      if (this.worker === worker) {
        this.worker = null;
        this.lines = null;
      }
    };
    worker.on("exit", drop);
    worker.on("error", drop);
    this.worker = worker;
    this.lines = lines;
    return { worker, lines };
  }

  private killWorker(): void {
    const worker = this.worker;
    const lines = this.lines;
    this.worker = null;
    this.lines = null;
    lines?.close();
    if (!worker || worker.killed) return;
    worker.kill();
  }
}
