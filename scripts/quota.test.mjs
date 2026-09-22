import assert from "node:assert/strict";
import test from "node:test";
import { parseClaudeOAuthUsage } from "../dist-electron/electron/sources/claude-quota.js";
import { parseCursorPeriodUsage } from "../dist-electron/electron/sources/cursor-quota.js";
import { parseResetAt } from "../dist-electron/electron/sources/quota-cache.js";

test("Claude usage maps the 5-hour window and the weekly total", () => {
  const quota = parseClaudeOAuthUsage({
    five_hour: { utilization: 34.2, resets_at: "2026-09-22T18:00:00Z" },
    seven_day: { utilization: 61, resets_at: 1780000000 },
    seven_day_opus: { utilization: 12, resets_at: "2026-09-28T00:00:00Z" },
  });
  assert.ok(quota);
  assert.equal(quota.windows.length, 2);
  assert.equal(quota.windows[0].label, "Janela");
  assert.equal(quota.windows[0].usedPercent, 34.2);
  assert.equal(quota.windows[1].label, "Total");
  assert.equal(quota.windows[1].usedPercent, 61);
  assert.equal(quota.windows[0].resetsAt, Date.parse("2026-09-22T18:00:00Z"));
  assert.equal(quota.windows[1].resetsAt, 1780000000 * 1000);
});

test("Claude usage ignores missing buckets instead of inventing numbers", () => {
  assert.equal(parseClaudeOAuthUsage({ five_hour: null, seven_day: null }), null);
  const onlyWeek = parseClaudeOAuthUsage({
    five_hour: null,
    seven_day: { utilization: 8 },
  });
  assert.ok(onlyWeek);
  assert.equal(onlyWeek.windows.length, 1);
  assert.equal(onlyWeek.windows[0].label, "Total");
});

test("Cursor period usage prefers totalPercentUsed and keeps the cycle end", () => {
  const quota = parseCursorPeriodUsage({
    planUsage: { totalPercentUsed: 42.7, limit: 40000, remaining: 10000 },
    billingCycleEnd: "1780500000000",
  });
  assert.ok(quota);
  assert.equal(quota.windows.length, 1);
  assert.equal(quota.windows[0].label, "Plano");
  assert.equal(quota.windows[0].usedPercent, 42.7);
  assert.equal(quota.windows[0].resetsAt, 1780500000000);
});

test("Cursor usage can derive percent from cents when the API omits totalPercentUsed", () => {
  const quota = parseCursorPeriodUsage({
    planUsage: { used: 80, limit: 200 },
  });
  assert.ok(quota);
  assert.equal(quota.windows[0].usedPercent, 40);
});

test("parseResetAt accepts seconds, milliseconds and ISO timestamps", () => {
  assert.equal(parseResetAt(1_780_000_000), 1_780_000_000_000);
  assert.equal(parseResetAt(1_780_000_000_000), 1_780_000_000_000);
  assert.equal(parseResetAt("2026-09-22T15:00:00.000Z"), Date.parse("2026-09-22T15:00:00.000Z"));
});
