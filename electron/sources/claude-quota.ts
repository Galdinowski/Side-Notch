import fs from "node:fs";
import path from "node:path";
import type { QuotaWindow, SourceQuota } from "../types.js";
import { claudeHome } from "./claude-context.js";
import { clampPercent, parseResetAt } from "./quota-cache.js";

interface UsageBucket {
  utilization?: number;
  used_percentage?: number;
  resets_at?: unknown;
}

export function parseClaudeOAuthUsage(raw: unknown): SourceQuota | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, UsageBucket | null | undefined>;
  const windows: QuotaWindow[] = [];

  const session = bucketWindow("session", "Janela", row.five_hour);
  const total = bucketWindow("week", "Total", row.seven_day);
  if (session) windows.push(session);
  if (total) windows.push(total);

  return windows.length > 0 ? { windows } : null;
}

export async function fetchClaudeQuota(): Promise<SourceQuota | null> {
  const token = readClaudeAccessToken();
  if (!token) return null;

  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-code/2.1.278",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;
  return parseClaudeOAuthUsage(await response.json());
}

function bucketWindow(
  id: string,
  label: string,
  bucket: UsageBucket | null | undefined,
): QuotaWindow | null {
  if (!bucket || typeof bucket !== "object") return null;
  const usedPercent = clampPercent(bucket.utilization ?? bucket.used_percentage);
  if (usedPercent == null) return null;
  return {
    id,
    label,
    usedPercent,
    resetsAt: parseResetAt(bucket.resets_at),
  };
}

function readClaudeAccessToken(): string | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(claudeHome(), ".credentials.json"), "utf8"),
    ) as { claudeAiOauth?: { accessToken?: string } };
    const token = parsed.claudeAiOauth?.accessToken;
    return typeof token === "string" && token.length > 8 ? token : null;
  } catch {
    return null;
  }
}
