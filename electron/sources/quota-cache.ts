import type { SourceQuota } from "../types.js";

const OK_TTL_MS = 90_000;
const FAIL_TTL_MS = 20_000;

export class QuotaCache {
  private value: SourceQuota | null = null;
  private nextAt = 0;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly load: () => Promise<SourceQuota | null>) {}

  peek(): SourceQuota | null {
    return this.value;
  }

  touch(): SourceQuota | null {
    if (!this.inFlight && Date.now() >= this.nextAt) {
      this.inFlight = this.load()
        .then((next) => {
          if (next) this.value = next;
          this.nextAt = Date.now() + (next ? OK_TTL_MS : FAIL_TTL_MS);
        })
        .catch(() => {
          this.nextAt = Date.now() + FAIL_TTL_MS;
        })
        .finally(() => {
          this.inFlight = null;
        });
    }
    return this.value;
  }
}

export function parseResetAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber < 1e12 ? asNumber * 1000 : asNumber;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function clampPercent(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}
