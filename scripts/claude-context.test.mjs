import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claudeTranscriptPath,
  contextWindowSize,
  encodeClaudeProjectSlug,
  parseLastUsageFromJsonl,
  readClaudeContextPercent,
  usedInputTokens,
  usageToPercent,
} from "../dist-electron/electron/sources/claude-context.js";

test("project slug matches Claude Code folder names", () => {
  assert.equal(
    encodeClaudeProjectSlug("C:\\git\\ss_erp_tag-prd0141"),
    "C--git-ss-erp-tag-prd0141",
  );
  assert.equal(
    claudeTranscriptPath("C:\\Users\\arthu\\.claude", "C:\\git\\foo", "abc-123"),
    "C:\\Users\\arthu\\.claude\\projects\\C--git-foo\\abc-123.jsonl",
  );
});

test("context percent uses input plus cache tokens against the model window", () => {
  const usage = {
    model: "claude-opus-5",
    inputTokens: 2,
    cacheCreationTokens: 1856,
    cacheReadTokens: 308273,
    outputTokens: 1521,
  };
  assert.equal(usedInputTokens(usage), 310131);
  assert.equal(contextWindowSize(usage.model, 310131), 1_000_000);
  assert.equal(Math.round(usageToPercent(usage)), 31);
});

test("older models stay on a 200k window until usage itself proves 1M", () => {
  assert.equal(contextWindowSize("claude-sonnet-4-5", 40_000), 200_000);
  assert.equal(contextWindowSize("claude-sonnet-4-5", 250_000), 1_000_000);
  assert.equal(contextWindowSize("claude-sonnet-4-6", 40_000), 1_000_000);
});

test("last assistant usage is taken from the tail of a JSONL transcript", () => {
  const text = [
    '{"type":"user"}',
    '{"message":{"model":"claude-opus-5","usage":{"input_tokens":10,"cache_creation_input_tokens":20,"cache_read_input_tokens":30}}}',
    '{"message":{"model":"claude-opus-5","usage":{"input_tokens":2,"cache_creation_input_tokens":100,"cache_read_input_tokens":400}}}',
  ].join("\n");
  const usage = parseLastUsageFromJsonl(text, false);
  assert.equal(usage?.inputTokens, 2);
  assert.equal(usage?.cacheReadTokens, 400);
  assert.equal(usedInputTokens(usage), 502);
});

test("readClaudeContextPercent returns null when the transcript is missing", () => {
  assert.equal(
    readClaudeContextPercent("C:\\missing-project", "no-such-session", os.tmpdir()),
    null,
  );
});

test("readClaudeContextPercent reads a real transcript file", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "side-notch-claude-"));
  const cwd = "C:\\git\\demo_app";
  const sessionId = "11111111-2222-3333-4444-555555555555";
  const file = claudeTranscriptPath(home, cwd, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({
      message: {
        model: "claude-sonnet-4-5",
        usage: {
          input_tokens: 1000,
          cache_creation_input_tokens: 9000,
          cache_read_input_tokens: 10000,
        },
      },
    })}\n`,
  );
  const percent = readClaudeContextPercent(cwd, sessionId, home);
  assert.equal(percent, 10);
  fs.rmSync(home, { recursive: true, force: true });
});
