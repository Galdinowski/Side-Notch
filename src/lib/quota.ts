import type { QuotaWindow, SourceQuota } from "../../shared/types";

export function formatResetIn(resetsAt: number | null | undefined, now = Date.now()): string | null {
  if (resetsAt == null || !Number.isFinite(resetsAt)) return null;
  const ms = resetsAt - now;
  if (ms <= 0) return "resetando";
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function quotaLevel(percent: number): "safe" | "warning" | "danger" {
  if (percent >= 85) return "danger";
  if (percent >= 65) return "warning";
  return "safe";
}

export function quotaSummary(quota: SourceQuota | null | undefined): string | null {
  if (!quota?.windows.length) return null;
  return quota.windows
    .map((window) => {
      const reset = formatResetIn(window.resetsAt);
      const used = `${Math.round(window.usedPercent)}%`;
      return reset ? `${window.label} ${used} · ${reset}` : `${window.label} ${used}`;
    })
    .join("  ·  ");
}

export function hasQuota(quota: SourceQuota | null | undefined): quota is SourceQuota {
  return Boolean(quota?.windows.length);
}

export type { QuotaWindow, SourceQuota };
