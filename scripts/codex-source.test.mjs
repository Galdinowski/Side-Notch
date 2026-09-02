import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CodexSource,
  ingestSessionFile,
} from "../dist-electron/electron/sources/codex-source.js";

const SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function sessionMeta() {
  return JSON.stringify({
    type: "session_meta",
    payload: { session_id: SESSION_ID, cwd: "C:\\proj" },
  });
}

function eventLine(type) {
  return JSON.stringify({ type: "event_msg", payload: { type } });
}

function writeSession(home, lines) {
  const sessionsDir = path.join(home, "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  const file = path.join(sessionsDir, `${SESSION_ID}.jsonl`);
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

function writeLock(home) {
  const locksDir = path.join(home, "thread-writer-locks");
  fs.mkdirSync(locksDir, { recursive: true });
  fs.writeFileSync(path.join(locksDir, `${SESSION_ID}.lock`), "");
}

async function withHome(run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "side-notch-codex-"));
  try {
    return await run(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test("counts lock files as live process presence", async () => {
  await withHome(async (home) => {
    writeLock(home);
    const snapshot = await new CodexSource(home).read();
    assert.equal(snapshot.health.status, "ok");
    assert.equal(snapshot.liveProcessCount, 1);
    assert.equal(snapshot.agents.length, 0);
  });
});

test("skips unchanged session files and applies a JSONL tail", async () => {
  await withHome(async (home) => {
    const file = writeSession(home, [sessionMeta(), eventLine("task_started")]);
    const cache = new Map();
    const first = ingestSessionFile(file, cache);
    assert.equal(first?.active, true);
    assert.equal(first?.id, SESSION_ID);

    const second = ingestSessionFile(file, cache);
    assert.equal(second, first);

    fs.appendFileSync(file, `${eventLine("task_complete")}\n`);
    const third = ingestSessionFile(file, cache);
    assert.equal(third, first);
    assert.equal(third?.active, false);

    writeLock(home);
    const snapshot = await new CodexSource(home).read();
    assert.equal(snapshot.liveProcessCount, 1);
    assert.equal(snapshot.agents.length, 0);
  });
});

test("reports an active Codex session from recent JSONL", async () => {
  await withHome(async (home) => {
    writeSession(home, [sessionMeta(), eventLine("task_started")]);
    const snapshot = await new CodexSource(home).read();
    assert.equal(snapshot.agents.length, 1);
    assert.equal(snapshot.agents[0].id, SESSION_ID);
    assert.equal(snapshot.agents[0].isRunning, true);
    assert.equal(snapshot.liveProcessCount, 0);
  });
});
