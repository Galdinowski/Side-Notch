import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "electron", "preload.cjs");
const toDir = path.join(root, "dist-electron", "electron");
const to = path.join(toDir, "preload.cjs");

fs.mkdirSync(toDir, { recursive: true });
fs.copyFileSync(from, to);
