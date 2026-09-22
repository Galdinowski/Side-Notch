import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { SourceId } from "./types.js";
import { SOURCE_ORDER } from "./types.js";
import { childEnv, which } from "./which.js";

const execFileAsync = promisify(execFile);

export interface AgentOpenRequest {
  source: SourceId;
  id: string;
  workspacePath: string | null;
  pid?: number | null;
  name?: string;
  attachId?: string | null;
}

export type OpenPlan =
  | { action: "focus"; pid: number; fallback: OpenPlan | null }
  | { action: "attach"; attach: AttachPlan }
  | { action: "open-app"; bin: string; args: string[]; env?: Record<string, string> }
  | { action: "open-folder"; target: string }
  | { action: "reject"; detail: string };

export const CURSOR_COMPOSER_SCHEME = "cursor.composer";

interface AttachPlan {
  launcher: "wt" | "cmd";
  command: string;
  args: string[];
}

export function isSafeSessionId(id: string): boolean {
  return /^[A-Za-z0-9._-]{4,80}$/.test(id);
}

export function parseOpenRequest(raw: unknown): AgentOpenRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!SOURCE_ORDER.includes(row.source as SourceId)) return null;
  if (typeof row.id !== "string" || !isSafeSessionId(row.id)) return null;
  const workspacePath =
    typeof row.workspacePath === "string" && row.workspacePath.trim()
      ? path.resolve(row.workspacePath)
      : null;
  const pid =
    typeof row.pid === "number" && Number.isInteger(row.pid) && row.pid > 0 && row.pid <= 2_000_000_000
      ? row.pid
      : null;
  const name = typeof row.name === "string" ? row.name : undefined;
  const attachId =
    typeof row.attachId === "string" && isSafeSessionId(row.attachId) ? row.attachId : null;
  return {
    source: row.source as SourceId,
    id: row.id,
    workspacePath,
    pid,
    name,
    attachId,
  };
}

export function safeWindowTitle(name: string | undefined): string {
  const trimmed = (name ?? "")
    .replace(/["\r\n&|^<>]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 48)
    .trim();
  return trimmed || "Claude";
}

export function isCursorCloudAgentId(id: string): boolean {
  return id.startsWith("bc-");
}

export function buildCursorComposerUri(id: string): string {
  return `${CURSOR_COMPOSER_SCHEME}:${id}`;
}

/**
 * O CLI do Cursor é um `.cmd`, e o Node se recusa a executar `.cmd`/`.bat` sem
 * shell. Reproduzimos o que o script faz: rodar `out/cli.js` dentro do
 * executável do app em modo Node.
 */
export function buildCursorLaunch(
  cliPath: string,
  id: string,
  fileExists: (target: string) => boolean,
): { bin: string; args: string[]; env?: Record<string, string> } {
  const bin = path.dirname(cliPath);
  const exe = path.resolve(bin, "..", "..", "..", "Cursor.exe");
  const cliJs = path.resolve(bin, "..", "out", "cli.js");
  const args = buildCursorOpenArgs(id);
  if (fileExists(exe) && fileExists(cliJs)) {
    return { bin: exe, args: [cliJs, ...args], env: { ELECTRON_RUN_AS_NODE: "1" } };
  }
  return { bin: cliPath, args };
}

export function buildCursorOpenArgs(id: string): string[] {
  if (isCursorCloudAgentId(id)) {
    return [
      "--open-url",
      "--",
      `cursor://anysphere.cursor-deeplink/background-agent?bcId=${encodeURIComponent(id)}`,
    ];
  }
  return ["--reuse-window", "--file-uri", buildCursorComposerUri(id)];
}

export function buildAttachPlan(
  claudeBin: string,
  id: string,
  cwd: string,
  title: string,
  wtBin: string | null,
): AttachPlan {
  if (wtBin) {
    return {
      launcher: "wt",
      command: wtBin,
      args: ["-w", "0", "new-tab", "-d", cwd, "--title", title, claudeBin, "attach", id],
    };
  }
  return {
    launcher: "cmd",
    command: "cmd.exe",
    args: ["/c", "start", title, "/D", cwd, claudeBin, "attach", id],
  };
}

export function planOpenAgent(
  request: AgentOpenRequest,
  tools: {
    claudeBin: string | null;
    cursorBin: string | null;
    wtBin: string | null;
    pathExists: (target: string) => boolean;
    fileExists: (target: string) => boolean;
  },
): OpenPlan {
  if (request.source === "claude") {
    const cwd = request.workspacePath;
    const cwdOk = Boolean(cwd && tools.pathExists(cwd));
    // `claude attach` só aceita o id de job das sessões em background.
    const attach =
      tools.claudeBin && cwdOk && cwd && request.attachId
        ? buildAttachPlan(
            tools.claudeBin,
            request.attachId,
            cwd,
            safeWindowTitle(request.name),
            tools.wtBin,
          )
        : null;
    const offline: OpenPlan | null = attach
      ? { action: "attach", attach }
      : cwdOk && cwd
        ? { action: "open-folder", target: cwd }
        : null;

    if (request.pid) {
      return { action: "focus", pid: request.pid, fallback: offline };
    }
    if (offline) return offline;
    return { action: "reject", detail: "Sessão Claude sem pasta ou CLI" };
  }

  if (request.source === "cursor" && tools.cursorBin) {
    const launch = buildCursorLaunch(tools.cursorBin, request.id, tools.fileExists);
    return { action: "open-app", ...launch };
  }

  const target = request.workspacePath;
  if (!target || !tools.pathExists(target)) {
    return { action: "reject", detail: "Pasta da sessão não encontrada" };
  }
  return { action: "open-folder", target };
}

export async function openAgent(raw: unknown): Promise<{ ok: boolean; detail?: string }> {
  const request = parseOpenRequest(raw);
  if (!request) return { ok: false, detail: "Pedido inválido" };

  const [claudeBin, cursorBin, wtBin] = await Promise.all([
    request.source === "claude" ? which("claude") : Promise.resolve(null),
    request.source === "cursor" ? which("cursor") : Promise.resolve(null),
    request.source === "claude" ? which("wt") : Promise.resolve(null),
  ]);

  const plan = planOpenAgent(request, {
    claudeBin,
    cursorBin,
    wtBin,
    pathExists: (target) => statKind(target) === "dir",
    fileExists: (target) => statKind(target) === "file",
  });

  return executeOpenPlan(plan);
}

function statKind(target: string): "dir" | "file" | null {
  try {
    const stat = fs.statSync(target);
    return stat.isDirectory() ? "dir" : stat.isFile() ? "file" : null;
  } catch {
    return null;
  }
}

export async function executeOpenPlan(plan: OpenPlan): Promise<{ ok: boolean; detail?: string }> {
  if (plan.action === "reject") return { ok: false, detail: plan.detail };

  if (plan.action === "focus") {
    if (await focusPid(plan.pid)) return { ok: true };
    if (plan.fallback) return executeOpenPlan(plan.fallback);
    return { ok: false, detail: "Não foi possível focar a sessão" };
  }

  if (plan.action === "attach") {
    return spawnDetached(plan.attach.command, plan.attach.args);
  }

  if (plan.action === "open-app") {
    return spawnDetached(plan.bin, plan.args, plan.env);
  }

  return spawnDetached("explorer.exe", [plan.target]);
}

export function buildFocusArgs(pid: number): { command: string; args: string[] } {
  return {
    command: "powershell.exe",
    args: [
      "-NoProfile",
      "-WindowStyle",
      "Hidden",
      "-Command",
      // A sessão interativa roda dentro de um terminal: a janela pertence a
      // algum processo ancestral, não ao próprio processo do Claude.
      `$shell = New-Object -ComObject WScript.Shell; $id = ${pid}; for ($i = 0; $i -lt 6 -and $id -gt 0; $i++) { $proc = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($proc -and $proc.MainWindowHandle -ne 0 -and $shell.AppActivate($id)) { exit 0 }; $id = (Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue).ParentProcessId }; exit 1`,
    ],
  };
}

async function focusPid(pid: number): Promise<boolean> {
  const { command, args } = buildFocusArgs(pid);
  try {
    await execFileAsync(command, args, {
      windowsHide: true,
      timeout: 8000,
      env: childEnv(),
    });
    return true;
  } catch {
    return false;
  }
}

function spawnDetached(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<{ ok: boolean; detail?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: { ...childEnv(), ...env },
    });
    // Sem este listener um spawn inválido vira exceção não tratada e derruba o app.
    child.once("error", (error: Error) => {
      resolve({ ok: false, detail: `Falha ao abrir: ${error.message.slice(0, 120)}` });
    });
    child.once("spawn", () => {
      child.unref();
      resolve({ ok: true });
    });
  });
}
