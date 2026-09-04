import assert from "node:assert/strict";
import test from "node:test";
import {
  groupAgents,
  healthLine,
  isSourceInUse,
  isSourceVisible,
  panelSources,
  visibleSources,
} from "../dist-electron/shared/types.js";
import {
  closestSnap,
  compactAnchorFromBounds,
  compactSize,
  emptyPanelSize,
  PILL_INSET,
  positionForSize,
  resolveDock,
  sizeForMode,
  toastSize,
  toastStackHeight,
} from "../dist-electron/shared/layout.js";
import {
  isSettledCompact,
  pillMode,
  slotCountForPill,
} from "../dist-electron/shared/motion.js";
import { settleSource, timeoutSnapshot } from "../dist-electron/electron/sources/collect.js";
import { mapCursorAgent } from "../dist-electron/electron/sources/cursor-map.js";

function source(id, overrides = {}) {
  return {
    source: id,
    health: { status: "ok" },
    agents: [],
    liveProcessCount: 0,
    ...overrides,
  };
}

test("error and outdated sources stay visible without live tasks", () => {
  const errored = source("cursor", { health: { status: "error", detail: "Node ausente" } });
  const missing = source("claude", { health: { status: "missing", detail: "PATH" } });
  const outdated = source("codex", { health: { status: "outdated", detail: "CLI" } });

  assert.equal(isSourceInUse(errored), false);
  assert.equal(isSourceVisible(errored), true);
  assert.equal(isSourceVisible(missing), false);
  assert.equal(isSourceVisible(outdated), true);
  assert.deepEqual(
    visibleSources([errored, missing, outdated]).map((item) => item.source),
    ["cursor", "codex"],
  );
  assert.equal(panelSources([errored, missing, outdated]).length, 2);
});

test("healthLine reports missing tools instead of omitting them", () => {
  const line = healthLine([
    source("cursor"),
    source("claude", { health: { status: "missing" } }),
    source("codex", { health: { status: "error", detail: "timeout" } }),
  ]);
  assert.match(line, /Claude ausente/);
  assert.match(line, /Codex erro/);
});

test("groupAgents keeps orphan subagents as their own rows", () => {
  const grouped = groupAgents([
    {
      source: "cursor",
      id: "child",
      composerId: "child",
      workspaceId: "ws",
      workspacePath: null,
      name: "Sub",
      subtitle: "",
      contextUsagePercent: 10,
      isRunning: true,
      isSubagent: true,
      parentComposerId: "missing-parent",
      hasBlockingPendingActions: false,
      linesAdded: 0,
      linesRemoved: 0,
      filesChanged: 0,
    },
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].parent.id, "child");
  assert.equal(grouped[0].children.length, 0);
});

test("mapCursorAgent does not coerce missing percent to 0", () => {
  const mapped = mapCursorAgent({
    composerId: "a",
    workspaceId: "ws",
    workspacePath: null,
    name: "Task",
    subtitle: "Em execução",
    contextUsagePercent: Number.NaN,
    isRunning: true,
    isSubagent: false,
    parentComposerId: null,
    hasBlockingPendingActions: false,
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0,
  });
  assert.equal(mapped.contextUsagePercent, null);
});

test("settleSource returns fallback when the reader is too slow", async () => {
  const fallback = timeoutSnapshot("claude");
  const snapshot = await settleSource(
    "claude",
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(timeoutSnapshot("cursor")), 80);
      }),
    20,
    fallback,
  );
  assert.equal(snapshot, fallback);
});

test("collapsing uses compact pill metrics without settling until compact", () => {
  assert.equal(pillMode("collapsing"), "compact");
  assert.equal(isSettledCompact("collapsing"), false);
  assert.equal(isSettledCompact("compact"), true);
  assert.equal(slotCountForPill("compact", 2, 3), 2);
  assert.equal(slotCountForPill("expanded", 2, 3), 3);
});

test("side collapse keeps the notch on the docked edge", () => {
  const work = { x: 0, y: 0, width: 1920, height: 1080 };
  const compact = compactSize("right", 1);
  const expanded = { width: 500, height: 400 };
  const anchor = { x: 1420, y: 240 };

  const rightOpen = positionForSize(expanded, "right", work, anchor, compact);
  assert.equal(rightOpen.x, 1920 - 500);
  assert.equal(rightOpen.y, 240);

  const rightClosed = positionForSize(compact, "right", work, rightOpen, expanded);
  assert.equal(rightClosed.x, 1920 - compact.width);
  assert.equal(rightClosed.y, 240);

  const leftOpen = positionForSize(expanded, "left", work, { x: 0, y: 240 }, compact);
  assert.equal(leftOpen.x, 0);

  const leftClosed = positionForSize(compact, "left", work, leftOpen, expanded);
  assert.equal(leftClosed.x, 0);
  assert.equal(leftClosed.y, 240);

  const remembered = compactAnchorFromBounds(
    { x: rightOpen.x, y: rightOpen.y, width: expanded.width, height: expanded.height },
    "right",
    compact,
  );
  assert.equal(remembered.x, 1920 - compact.width);
  assert.equal(remembered.y, 240);
});

test("corner docks sit on the work area floor above a bottom taskbar", () => {
  const work = { x: 0, y: 0, width: 1920, height: 1040 };
  const compact = compactSize("bottom-right", 1);
  const expanded = { width: 500, height: 400 };

  const rightOpen = positionForSize(expanded, "bottom-right", work, { x: 0, y: 0 }, compact);
  assert.equal(rightOpen.x, 1920 - 500);
  assert.equal(rightOpen.y, 1040 - 400);

  const rightClosed = positionForSize(compact, "bottom-right", work, rightOpen, expanded);
  assert.equal(rightClosed.x, 1920 - compact.width);
  assert.equal(rightClosed.y, 1040 - compact.height);

  const leftOpen = positionForSize(expanded, "bottom-left", work, { x: 0, y: 0 }, compact);
  assert.equal(leftOpen.x, 0);
  assert.equal(leftOpen.y, 1040 - 400);

  const remembered = compactAnchorFromBounds(
    { x: rightOpen.x, y: rightOpen.y, width: expanded.width, height: expanded.height },
    "bottom-right",
    compact,
  );
  assert.equal(remembered.x, 1920 - compact.width);
  assert.equal(remembered.y, 1040 - compact.height);
});

test("bottom-left follows a left taskbar inset", () => {
  const work = { x: 48, y: 0, width: 1872, height: 1080 };
  const compact = compactSize("bottom-left", 0);
  const pos = positionForSize(compact, "bottom-left", work, { x: 0, y: 0 }, compact);
  assert.equal(pos.x, 48);
  assert.equal(pos.y, 1080 - compact.height);
});

test("top pet spans the work area while active slots keep compact width", () => {
  assert.deepEqual(compactSize("top", 0, 1920), { width: 1920, height: 110 });
  assert.deepEqual(compactSize("top", 1, 1920), { width: 228, height: 84 });
});

test("traversing docks span the edge; dormant corners stay compact for the coil", () => {
  assert.deepEqual(compactSize("left", 0, 1920, 1040), { width: 96, height: 1040 });
  assert.deepEqual(compactSize("right", 0, 1920, 1040), { width: 96, height: 1040 });
  assert.deepEqual(compactSize("bottom-left", 0, 1920, 1040), { width: 200, height: 184 });
  assert.deepEqual(compactSize("bottom-right", 0, 1920, 1040), { width: 200, height: 184 });
  assert.deepEqual(compactSize("left", 1, 1920, 1040), { width: 96, height: 96 });
  assert.deepEqual(compactSize("bottom-right", 1, 1920, 1040), { width: 96, height: 96 });
});

test("dragging a side dock onto the work area floor becomes a corner dock", () => {
  const work = { x: 0, y: 0, width: 1920, height: 1040 };
  const compact = compactSize("left", 1);
  const againstFloor = {
    x: 0,
    y: 1040 - compact.height,
    width: compact.width,
    height: compact.height,
  };
  assert.equal(resolveDock(againstFloor, work, "left"), "bottom-left");

  const lifted = {
    x: 0,
    y: 200,
    width: compact.width,
    height: compact.height,
  };
  assert.equal(resolveDock(lifted, work, "bottom-left"), "left");

  assert.equal(
    closestSnap({ left: 4, right: 800, top: 400, bottom: 6 }),
    "bottom-left",
  );
  assert.equal(
    closestSnap({ left: 800, right: 4, top: 400, bottom: 6 }),
    "bottom-right",
  );
});

test("toast window is tall enough for stacked cards after the dock inset", () => {
  const stackTwo = toastStackHeight(2);
  assert.equal(stackTwo, 190);

  const top = toastSize("top", 2);
  assert.deepEqual(top, { width: 448, height: stackTwo + PILL_INSET.top.y });
  assert.equal(top.height - PILL_INSET.top.y, stackTwo);

  const floating = toastSize("floating", 2);
  assert.equal(floating.height - PILL_INSET.floating.y, stackTwo);

  const corner = toastSize("bottom-right", 2);
  assert.equal(corner.height - PILL_INSET["bottom-right"].y, stackTwo);

  assert.deepEqual(sizeForMode("toast", "top", 2, 1080), top);
});

test("empty expanded panel is a small card instead of a one-source sheet", () => {
  const empty = emptyPanelSize("bottom-right");
  assert.equal(empty.width, 280);
  assert.equal(empty.height, 120);
  const sized = sizeForMode("expanded", "bottom-left", 0, 1040);
  assert.deepEqual(sized, empty);
});
