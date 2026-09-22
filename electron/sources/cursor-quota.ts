import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { QuotaWindow, SourceQuota } from "../types.js";
import { childEnv } from "../which.js";
import { clampPercent, parseResetAt } from "./quota-cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function parseCursorPeriodUsage(raw: unknown): SourceQuota | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    planUsage?: Record<string, unknown>;
    plan_usage?: Record<string, unknown>;
    billingCycleEnd?: unknown;
    billing_cycle_end?: unknown;
  };
  const plan = row.planUsage ?? row.plan_usage;
  let usedPercent = clampPercent(plan?.totalPercentUsed ?? plan?.total_percent_used);
  if (usedPercent == null && plan) {
    const limit = Number(plan.limit);
    const used = Number(plan.used);
    const remaining = Number(plan.remaining);
    if (Number.isFinite(limit) && limit > 0 && Number.isFinite(used)) {
      usedPercent = clampPercent((used / limit) * 100);
    } else if (Number.isFinite(limit) && limit > 0 && Number.isFinite(remaining)) {
      usedPercent = clampPercent(((limit - remaining) / limit) * 100);
    }
  }
  if (usedPercent == null) return null;

  const window: QuotaWindow = {
    id: "plan",
    label: "Plano",
    usedPercent,
    resetsAt: parseResetAt(row.billingCycleEnd ?? row.billing_cycle_end),
  };
  return { windows: [window] };
}

export function fetchCursorQuota(nodeBinary: string): Promise<SourceQuota | null> {
  const script = resolveQuotaScript();
  return new Promise((resolve) => {
    const child = spawn(nodeBinary, [script], {
      windowsHide: true,
      env: childEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 8000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("exit", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout.trim() || "null") as unknown;
        resolve(parseCursorPeriodUsage(parsed));
      } catch {
        resolve(null);
      }
    });
  });
}

function resolveQuotaScript(): string {
  let current = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    const unpacked = current.replace(/app\.asar$/i, "app.asar.unpacked");
    const candidate = path.join(unpacked, "scripts", "read-cursor-quota.mjs");
    if (fs.existsSync(candidate) && !/app\.asar([\\/]|$)/i.test(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Missing scripts/read-cursor-quota.mjs");
}
