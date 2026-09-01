import assert from "node:assert/strict";
import test from "node:test";
import { NotificationHub } from "../dist-electron/electron/notifications.js";

const settings = {
  dock: "floating",
  launchOnStartup: false,
  pollIntervalMs: 1500,
  notifyCursor: true,
  notifyClaude: true,
  notifyCodex: true,
};

function agent(id, overrides = {}) {
  return {
    source: "cursor",
    id,
    composerId: id,
    workspaceId: "workspace",
    workspacePath: "C:\\workspace",
    name: `Task ${id}`,
    subtitle: "Executando",
    contextUsagePercent: 10,
    isRunning: true,
    isSubagent: false,
    parentComposerId: null,
    hasBlockingPendingActions: false,
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0,
    ...overrides,
  };
}

function source(agents, health = { status: "ok" }) {
  return {
    source: "cursor",
    health,
    agents,
    liveProcessCount: 0,
  };
}

function setup() {
  let now = 0;
  const toasts = [];
  const hub = new NotificationHub({
    visibleMs: 5,
    goneMs: 5,
    groupMs: 1,
    now: () => now,
  });
  hub.setOnToast((toast) => toasts.push(toast));
  return {
    hub,
    toasts,
    setNow(value) {
      now = value;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

test("does not notify while tasks remain active", async () => {
  const { hub, toasts, setNow } = setup();
  hub.ingest([source([agent("a")])], settings);
  setNow(20);
  hub.ingest([source([agent("a")])], settings);
  await flush();
  assert.equal(toasts.length, 0);
});

test("shows actions that are already pending at startup", () => {
  const { hub, toasts } = setup();
  hub.ingest([
    source([
      agent("a", {
        isRunning: false,
        hasBlockingPendingActions: true,
        subtitle: "Confirmação necessária",
      }),
    ]),
  ], settings);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].events[0].kind, "action");
  assert.equal(toasts[0].sticky, true);
});

test("groups simultaneous task completions into one toast", async () => {
  const { hub, toasts, setNow } = setup();
  hub.ingest([source([agent("a"), agent("b"), agent("c")])], settings);
  setNow(10);
  hub.ingest([source([])], settings);
  setNow(16);
  hub.ingest([source([])], settings);
  await flush();
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].events.length, 3);
  assert.ok(toasts[0].events.every((event) => event.kind === "completed"));
  assert.equal(toasts[0].sticky, false);
});

test("keeps same-named task completions as separate events", async () => {
  const { hub, toasts, setNow } = setup();
  hub.ingest([
    source([
      agent("a", { name: "Build" }),
      agent("b", { name: "Build" }),
    ]),
  ], settings);
  setNow(10);
  hub.ingest([source([])], settings);
  setNow(16);
  hub.ingest([source([])], settings);
  await flush();
  assert.equal(new Set(toasts[0].events.map((event) => event.id)).size, 2);
});

test("cancels completion when a task reappears during debounce", async () => {
  const { hub, toasts, setNow } = setup();
  hub.ingest([source([agent("a")])], settings);
  setNow(10);
  hub.ingest([source([])], settings);
  setNow(12);
  hub.ingest([source([agent("a")])], settings);
  setNow(30);
  hub.ingest([source([agent("a")])], settings);
  await flush();
  assert.equal(toasts.length, 0);
});

test("keeps intervention and errors sticky", () => {
  const { hub, toasts, setNow } = setup();
  hub.ingest([source([agent("a")])], settings);
  setNow(10);
  hub.ingest([
    source([
      agent("a", {
        isRunning: false,
        hasBlockingPendingActions: true,
        subtitle: "Permissão necessária",
      }),
    ]),
  ], settings);
  assert.equal(toasts[0].events[0].kind, "action");
  assert.equal(toasts[0].sticky, true);

  setNow(20);
  hub.ingest([source([], { status: "error", detail: "Leitura falhou" })], settings);
  assert.equal(toasts[1].events[0].kind, "error");
  assert.equal(toasts[1].sticky, true);
});

test("does not convert a source read failure into task completion", async () => {
  const { hub, toasts, setNow } = setup();
  hub.ingest([source([agent("a")])], settings);
  setNow(10);
  hub.ingest([source([], { status: "error", detail: "Banco ocupado" })], settings);
  setNow(30);
  hub.ingest([source([], { status: "error", detail: "Banco ocupado" })], settings);
  await flush();
  assert.equal(
    toasts.flatMap((toast) => toast.events).filter((event) => event.kind === "completed").length,
    0,
  );
});
