import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { downloadArtifact } from "@electron/get";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const electronModuleDir = path.join(projectRoot, "node_modules/electron");
const electronDistDir = path.join(
  process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
  "side-notch-electron",
);

function readElectronVersion() {
  return JSON.parse(
    fs.readFileSync(path.join(electronModuleDir, "package.json"), "utf8"),
  ).version;
}

function isElectronReady(version) {
  const electronExe = path.join(electronDistDir, "electron.exe");
  const versionFile = path.join(electronDistDir, "version");

  if (!fs.existsSync(electronExe)) {
    return false;
  }

  if (!fs.existsSync(versionFile)) {
    fs.writeFileSync(versionFile, `v${version}`);
  }

  const pathTxt = path.join(electronModuleDir, "path.txt");
  if (!fs.existsSync(pathTxt)) {
    fs.writeFileSync(pathTxt, "electron.exe");
  }

  return fs.readFileSync(versionFile, "utf8").trim() === `v${version}`;
}

async function extractZipWindows(zipPath, destination) {
  const tempDir = path.join(
    os.tmpdir(),
    `side-notch-electron-${Date.now()}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true },
    );

    if (fs.existsSync(destination)) {
      fs.rmSync(destination, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(tempDir, destination);
  } catch (error) {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

async function ensureElectronBinary() {
  const version = readElectronVersion();

  if (isElectronReady(version)) {
    return electronDistDir;
  }

  console.log(`Downloading Electron ${version}...`);

  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: "win32",
    arch: "x64",
  });

  if (process.platform !== "win32") {
    throw new Error(`Unsupported platform for Electron setup: ${process.platform}`);
  }

  await extractZipWindows(zipPath, electronDistDir);

  const electronExe = path.join(electronDistDir, "electron.exe");
  if (!fs.existsSync(electronExe)) {
    throw new Error(`electron.exe not found after extract at ${electronExe}`);
  }

  fs.writeFileSync(path.join(electronDistDir, "version"), `v${version}`);
  fs.writeFileSync(path.join(electronModuleDir, "path.txt"), "electron.exe");

  console.log(`Electron ${version} ready at ${electronDistDir}`);
  return electronDistDir;
}

function launchElectron(distPath) {
  const electronCli = path.join(electronModuleDir, "cli.js");
  const child = spawn(process.execPath, [electronCli, projectRoot], {
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_OVERRIDE_DIST_PATH: distPath,
      SIDE_NOTCH_NODE: process.execPath,
    },
  });

  return new Promise((resolve, reject) => {
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", reject);
  });
}

async function main() {
  const launchOnly = process.argv.includes("--launch-only");
  const ensureOnly = process.argv.includes("--ensure-only");

  let distPath = electronDistDir;

  if (!launchOnly) {
    distPath = await ensureElectronBinary();
  } else if (!isElectronReady(readElectronVersion())) {
    throw new Error(
      "Electron binary not found. Run: npm run electron:ensure",
    );
  }

  if (ensureOnly) {
    return;
  }

  const exitCode = await launchElectron(distPath);
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
