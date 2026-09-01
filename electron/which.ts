import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
    const line = stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean);
    return line ?? null;
  } catch {
    return null;
  }
}
