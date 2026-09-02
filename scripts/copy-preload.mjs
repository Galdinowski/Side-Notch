import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "electron", "preload.cjs");
const toDir = path.join(root, "dist-electron", "electron");
const to = path.join(toDir, "preload.cjs");

const required = [
  "window:commit-bounds",
  "sources:refresh",
  "sources:update",
  "view:expand",
  "toast:show",
];
const source = fs.readFileSync(from, "utf8");
const missing = required.filter((channel) => !source.includes(channel));
if (missing.length > 0) {
  throw new Error(
    `preload.cjs is missing IPC channels: ${missing.join(", ")}. Keep it aligned with electron/preload.ts.`,
  );
}

fs.mkdirSync(toDir, { recursive: true });
fs.copyFileSync(from, to);
