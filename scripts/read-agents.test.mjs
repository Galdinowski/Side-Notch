import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "read-agents.mjs");

function requestLine(child, lines) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("reader stdio timed out")), 20_000);
    lines.once("line", (line) => {
      clearTimeout(timer);
      resolve(line);
    });
    child.stdin.write("\n");
  });
}

test("stdio reader stays alive across two JSON requests", async () => {
  const child = spawn(process.execPath, [script, "--stdio"], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = readline.createInterface({ input: child.stdout });
  const pid = child.pid;

  try {
    const first = JSON.parse(await requestLine(child, lines));
    assert.ok(Array.isArray(first), "first reply must be a JSON array");
    const second = JSON.parse(await requestLine(child, lines));
    assert.ok(Array.isArray(second), "second reply must be a JSON array");
    assert.equal(child.pid, pid);
    assert.equal(child.exitCode, null);
  } finally {
    lines.close();
    child.kill();
  }
});
