import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

// where.exe também lista launchers sem extensão (scripts shell), que o Windows
// não consegue executar: spawn falha com ENOENT.
const EXECUTABLE_EXTENSIONS = new Set([".exe", ".com", ".cmd", ".bat"]);

export function pickExecutable(lines: string[]): string | null {
  const candidates = lines.map((entry) => entry.trim()).filter(Boolean);
  const runnable = candidates.find((entry) =>
    EXECUTABLE_EXTENSIONS.has(path.extname(entry).toLowerCase()),
  );
  return runnable ?? candidates[0] ?? null;
}

const execFileAsync = promisify(execFile);

export function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  delete env.ELECTRON_OVERRIDE_DIST_PATH;
  delete env.NODE_OPTIONS;
  env.FORCE_COLOR = "0";
  return env;
}

export async function which(binary: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("where.exe", [binary], {
      windowsHide: true,
      timeout: 4000,
      env: childEnv(),
    });
    return pickExecutable(stdout.split(/\r?\n/));
  } catch {
    return null;
  }
}
