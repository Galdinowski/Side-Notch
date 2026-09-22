import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TAIL_BYTES = 256 * 1024;

export interface ClaudeTokenUsage {
  model: string | null;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
}

export function encodeClaudeProjectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export function claudeTranscriptPath(
  home: string,
  cwd: string,
  sessionId: string,
): string {
  return path.join(home, "projects", encodeClaudeProjectSlug(cwd), `${sessionId}.jsonl`);
}

export function usedInputTokens(usage: ClaudeTokenUsage): number {
  return usage.inputTokens + usage.cacheCreationTokens + usage.cacheReadTokens;
}

export function contextWindowSize(model: string | null, used: number): number {
  if (used > 200_000) return 1_000_000;
  const id = (model ?? "").toLowerCase().replace(/_/g, "-");
  if (id.includes("[1m]") || /-1m\b/.test(id)) return 1_000_000;
  if (id.includes("fable")) return 1_000_000;
  if (modelMajorMinor(id, "opus") >= 4.6) return 1_000_000;
  if (modelMajorMinor(id, "sonnet") >= 4.6) return 1_000_000;
  return 200_000;
}

export function usageToPercent(usage: ClaudeTokenUsage): number {
  const used = usedInputTokens(usage);
  const window = contextWindowSize(usage.model, used);
  if (window <= 0) return 0;
  return (used / window) * 100;
}

export function parseLastUsageFromJsonl(text: string, startedMidFile: boolean): ClaudeTokenUsage | null {
  const lines = text.split(/\r?\n/);
  let last: ClaudeTokenUsage | null = null;
  for (let i = startedMidFile ? 1 : 0; i < lines.length; i += 1) {
    const usage = parseUsageLine(lines[i]);
    if (usage) last = usage;
  }
  return last;
}

export function readLastUsageFromFile(file: string): ClaudeTokenUsage | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (stat.size <= 0) return null;

  const start = Math.max(0, stat.size - TAIL_BYTES);
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return parseLastUsageFromJsonl(buf.toString("utf8"), start > 0);
  } finally {
    fs.closeSync(fd);
  }
}

export function readClaudeContextPercent(
  cwd: string | undefined,
  sessionId: string | undefined,
  home = claudeHome(),
): number | null {
  if (!cwd || !sessionId) return null;
  const file = claudeTranscriptPath(home, cwd, sessionId);
  const usage = readLastUsageFromFile(file);
  if (!usage) return null;
  const percent = usageToPercent(usage);
  return Number.isFinite(percent) ? percent : null;
}

function modelMajorMinor(id: string, family: "opus" | "sonnet"): number {
  const match = id.match(new RegExp(`${family}-(\\d+)(?:[.-](\\d+))?`));
  if (!match) return 0;
  const major = Number(match[1]);
  const minor = match[2] != null ? Number(match[2]) : 0;
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return 0;
  return major + minor / 10;
}

function parseUsageLine(line: string): ClaudeTokenUsage | null {
  if (!line || !line.includes('"usage"')) return null;
  try {
    const row = JSON.parse(line) as {
      message?: {
        model?: string;
        usage?: {
          input_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
          output_tokens?: number;
        };
      };
    };
    const usage = row.message?.usage;
    if (typeof usage?.input_tokens !== "number") return null;
    return {
      model: row.message?.model ?? null,
      inputTokens: usage.input_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    };
  } catch {
    return null;
  }
}
