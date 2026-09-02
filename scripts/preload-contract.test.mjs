import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preloadCjs = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
const preloadTs = fs.readFileSync(path.join(root, "electron", "preload.ts"), "utf8");

const channels = [
  "settings:get",
  "settings:set",
  "window:commit-bounds",
  "window:move",
  "window:mouse-ignore",
  "window:end-drag",
  "sources:refresh",
  "sources:update",
  "dock:update",
  "view:expand",
  "toast:show",
];

test("preload.cjs and preload.ts expose the same IPC channels", () => {
  for (const channel of channels) {
    assert.ok(preloadCjs.includes(channel), `preload.cjs missing ${channel}`);
    assert.ok(preloadTs.includes(channel), `preload.ts missing ${channel}`);
  }
  assert.equal(preloadCjs.includes("agents:refresh"), false);
  assert.equal(preloadCjs.includes("window:resize"), false);
});
