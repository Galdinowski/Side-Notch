import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import AutoLaunch from "auto-launch";
import { compactSize, sizeForMode } from "./layout.js";
import { NotificationHub } from "./notifications.js";
import { SourceHub } from "./sources/collect.js";
import type {
  AgentSnapshot,
  AppSettings,
  CommitBoundsOptions,
  NotchToast,
  SourcesPayload,
  ViewMode,
  WidgetDock,
  WindowRect,
} from "./types.js";
import { healthLine, inUseSources, panelSources } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const store = new Store<AppSettings>({
  defaults: {
    dock: "floating",
    launchOnStartup: false,
    pollIntervalMs: 1500,
    notifyCursor: true,
    notifyClaude: true,
    notifyCodex: true,
  },
});

const sourceHub = new SourceHub();
const notifications = new NotificationHub();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let pollInFlight: Promise<SourcesPayload> | null = null;
let currentMode: ViewMode = "compact";
let lastSources: SourcesPayload | null = null;
let lastAppliedSize = { width: 0, height: 0 };
let loggedHealth = false;
let ignoreMoved = false;
let compactAnchor = { x: 0, y: 0 };
let visitSlotCount = 1;

const isDev = !app.isPackaged;
const SNAP_IN = 28;
const SNAP_OUT = 48;
let ignoreMovedUntil = 0;

function getPreloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function getIndexHtmlPath(): string {
  return path.join(app.getAppPath(), "dist", "index.html");
}

function loadRenderer(window: BrowserWindow): void {
  if (isDev) {
    void window.loadURL("http://127.0.0.1:5173");
    return;
  }
  void window.loadFile(getIndexHtmlPath());
}

function getDock(): WidgetDock {
  return store.get("dock") ?? "floating";
}

function compactSlotCount(): number {
  if (!lastSources) return 0;
  return inUseSources(lastSources.sources).length;
}

function panelCount(): number {
  if (!lastSources) return 1;
  return Math.max(1, panelSources(lastSources.sources).length);
}

function slotCount(mode: ViewMode = currentMode): number {
  if (mode === "compact") return compactSlotCount();
  return visitSlotCount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function workAreaAtRect(rect: Electron.Rectangle): Electron.Rectangle {
  return screen.getDisplayMatching(rect).workArea;
}

function workAreaAtPoint(x: number, y: number): Electron.Rectangle {
  return screen.getDisplayNearestPoint({ x, y }).workArea;
}

function workAreaForWindow(): Electron.Rectangle {
  if (!mainWindow) return screen.getPrimaryDisplay().workArea;
  return workAreaAtRect(mainWindow.getBounds());
}

function centerOnWorkArea(
  size: { width: number; height: number },
  work: Electron.Rectangle,
): { x: number; y: number } {
  return {
    x: Math.round(work.x + (work.width - size.width) / 2),
    y: Math.round(work.y + (work.height - size.height) / 2),
  };
}

function edgeDistances(
  bounds: Electron.Rectangle,
  work: Electron.Rectangle,
): { left: number; right: number; top: number } {
  return {
    left: bounds.x - work.x,
    right: work.x + work.width - (bounds.x + bounds.width),
    top: bounds.y - work.y,
  };
}

function closestSnap(
  distances: { left: number; right: number; top: number },
): WidgetDock {
  const candidates: { dock: WidgetDock; dist: number }[] = [];
  if (distances.left <= SNAP_IN) candidates.push({ dock: "left", dist: distances.left });
  if (distances.right <= SNAP_IN) candidates.push({ dock: "right", dist: distances.right });
  if (distances.top <= SNAP_IN) candidates.push({ dock: "top", dist: distances.top });
  if (candidates.length === 0) return "floating";
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0]?.dock ?? "floating";
}

function resolveDock(
  bounds: Electron.Rectangle,
  work: Electron.Rectangle,
  current: WidgetDock,
): WidgetDock {
  const distances = edgeDistances(bounds, work);
  const { left, right, top } = distances;

  if (current === "left") {
    return left <= SNAP_OUT ? "left" : closestSnap(distances);
  }
  if (current === "right") {
    return right <= SNAP_OUT ? "right" : closestSnap(distances);
  }
  if (current === "top") {
    if (top > SNAP_OUT) return closestSnap(distances);
    if (left <= SNAP_IN && left < top) return "left";
    if (right <= SNAP_IN && right < top) return "right";
    return "top";
  }
  return closestSnap(distances);
}

function suppressMoved(ms = 450): void {
  ignoreMovedUntil = Date.now() + ms;
}

function persistAnchor(): void {
  store.set("windowX", compactAnchor.x);
  store.set("windowY", compactAnchor.y);
}

function sendDock(dock: WidgetDock): void {
  mainWindow?.webContents.send("dock:update", dock);
}

function fitInWork(
  x: number,
  y: number,
  size: { width: number; height: number },
  work: Electron.Rectangle,
): { x: number; y: number } {
  return {
    x: clamp(x, work.x, work.x + work.width - size.width),
    y: clamp(y, work.y, work.y + work.height - size.height),
  };
}

function rememberAnchorFromBounds(
  bounds: Electron.Rectangle,
  dock: WidgetDock,
): void {
  const compact = compactSize(dock, compactSlotCount());
  if (dock === "left" || dock === "right" || dock === "top") {
    compactAnchor = { x: bounds.x, y: bounds.y };
    return;
  }
  compactAnchor = {
    x: Math.round(bounds.x + bounds.width / 2 - compact.width / 2),
    y: Math.round(bounds.y + bounds.height / 2 - compact.height / 2),
  };
}

const EDGE_GROW = 72;

function positionForSize(
  size: { width: number; height: number },
  dock: WidgetDock,
  work: Electron.Rectangle,
  options?: { center?: boolean },
): { x: number; y: number } {
  if (options?.center) {
    return centerOnWorkArea(size, work);
  }

  const prevW =
    lastAppliedSize.width > 0
      ? lastAppliedSize.width
      : compactSize(dock, compactSlotCount()).width;
  const prevH =
    lastAppliedSize.height > 0
      ? lastAppliedSize.height
      : compactSize(dock, compactSlotCount()).height;

  if (dock === "left") {
    return {
      x: work.x,
      y: clamp(compactAnchor.y, work.y, work.y + work.height - size.height),
    };
  }
  if (dock === "right") {
    return {
      x: work.x + work.width - size.width,
      y: clamp(compactAnchor.y, work.y, work.y + work.height - size.height),
    };
  }
  if (dock === "top") {
    const centerX = compactAnchor.x + prevW / 2;
    return {
      x: clamp(
        Math.round(centerX - size.width / 2),
        work.x,
        work.x + work.width - size.width,
      ),
      y: work.y,
    };
  }

  const ax = compactAnchor.x;
  const ay = compactAnchor.y;
  const distTop = ay - work.y;
  const distLeft = ax - work.x;
  const distRight = work.x + work.width - (ax + prevW);
  const distBottom = work.y + work.height - (ay + prevH);

  let x: number;
  if (distLeft <= SNAP_IN && distLeft <= distRight) {
    x = ax;
  } else if (distRight <= SNAP_IN) {
    x = ax + prevW - size.width;
  } else if (distLeft <= EDGE_GROW && distLeft <= distRight) {
    x = ax;
  } else if (distRight <= EDGE_GROW) {
    x = ax + prevW - size.width;
  } else {
    x = Math.round(ax + prevW / 2 - size.width / 2);
  }

  let y: number;
  if (distTop <= SNAP_IN && distTop <= distBottom) {
    y = ay;
  } else if (distBottom <= SNAP_IN) {
    y = ay + prevH - size.height;
  } else if (distTop <= EDGE_GROW && distTop <= distBottom) {
    y = ay;
  } else if (distBottom <= EDGE_GROW) {
    y = ay + prevH - size.height;
  } else {
    y = Math.round(ay + prevH / 2 - size.height / 2);
  }

  return fitInWork(x, y, size, work);
}

function applyBounds(
  mode: ViewMode,
  dock: WidgetDock,
  options?: { center?: boolean },
): WindowRect {
  if (!mainWindow) {
    return { x: compactAnchor.x, y: compactAnchor.y, ...lastAppliedSize };
  }

  const work = options?.center
    ? screen.getPrimaryDisplay().workArea
    : workAreaForWindow();
  const size = sizeForMode(mode, dock, slotCount(mode), work.height);
  const current = mainWindow.getBounds();
  const { x, y } = positionForSize(size, dock, work, options);

  const rect: WindowRect = { x, y, width: size.width, height: size.height };

  if (
    x === current.x &&
    y === current.y &&
    size.width === current.width &&
    size.height === current.height
  ) {
    lastAppliedSize = size;
    return rect;
  }

  suppressMoved();
  ignoreMoved = true;
  mainWindow.setBounds(rect, false);
  lastAppliedSize = size;
  if (mode === "compact") {
    compactAnchor = { x, y };
  } else {
    rememberAnchorFromBounds(rect, dock);
  }
  persistAnchor();
  setTimeout(() => {
    ignoreMoved = false;
  }, 80);
  return rect;
}

function setDock(
  dock: WidgetDock,
  options?: { center?: boolean; layoutOnly?: boolean },
): void {
  store.set("dock", dock);
  sendDock(dock);
  refreshTrayMenu();

  if (options?.layoutOnly) return;

  if (dock === "top" && !options?.center) {
    const work = workAreaForWindow();
    const size = sizeForMode(currentMode, dock, slotCount(), work.height);
    compactAnchor = {
      x: Math.round(work.x + (work.width - size.width) / 2),
      y: work.y,
    };
  }

  applyBounds(currentMode, dock, options);
}

function commitMode(mode: ViewMode, options?: CommitBoundsOptions): WindowRect {
  currentMode = mode;
  if (mode === "compact") {
    visitSlotCount = panelCount();
  } else if (options?.slotCount != null) {
    visitSlotCount = Math.max(1, options.slotCount);
  } else {
    visitSlotCount = panelCount();
  }
  return applyBounds(mode, getDock());
}

function moveWindowTo(x: number, y: number): void {
  if (!mainWindow) return;
  const size = lastAppliedSize;
  const intended = { x, y, width: size.width, height: size.height };
  const work = workAreaAtRect(intended);
  const currentDock = getDock();
  const nextDock = resolveDock(intended, work, currentDock);

  if (nextDock !== currentDock) {
    store.set("dock", nextDock);
    sendDock(nextDock);
    refreshTrayMenu();
  }

  let ax = x;
  let ay = y;
  if (nextDock === "left") ax = work.x;
  else if (nextDock === "right") ax = work.x + work.width - size.width;
  else if (nextDock === "top") {
    ay = work.y;
    if (currentDock !== "top") {
      ax = Math.round(work.x + (work.width - size.width) / 2);
    }
  }
  ({ x: ax, y: ay } = fitInWork(ax, ay, size, work));
  if (nextDock === "top") ay = work.y;

  suppressMoved(80);
  ignoreMoved = true;
  mainWindow.setBounds({ x: ax, y: ay, width: size.width, height: size.height }, false);
  rememberAnchorFromBounds(
    { x: ax, y: ay, width: size.width, height: size.height },
    nextDock,
  );
  persistAnchor();
  setTimeout(() => {
    ignoreMoved = false;
  }, 40);
}

function endDrag(): void {
  if (!mainWindow) return;
  applyBounds(currentMode, getDock());
}

function setMouseIgnore(ignore: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
}

function focusOverlay(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.focus();
  mainWindow.webContents.send("view:expand");
}

function reflowForDisplayChange(): void {
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    applyBounds(currentMode, getDock());
  }, 80);
}

function createWindow(): void {
  const dock = getDock();
  const storedX = store.has("windowX") ? (store.get("windowX") as number) : undefined;
  const storedY = store.has("windowY") ? (store.get("windowY") as number) : undefined;
  const work =
    storedX != null && storedY != null
      ? workAreaAtPoint(storedX, storedY)
      : screen.getPrimaryDisplay().workArea;
  const size = compactSize(dock, 0);
  visitSlotCount = 1;

  let x: number;
  let y: number;

  if (storedX != null && storedY != null && dock === "floating") {
    x = clamp(storedX, work.x, work.x + work.width - size.width);
    y = clamp(storedY, work.y, work.y + work.height - size.height);
  } else if (dock === "left") {
    x = work.x;
    y = storedY != null
      ? clamp(storedY, work.y, work.y + work.height - size.height)
      : Math.round(work.y + (work.height - size.height) / 2);
  } else if (dock === "right") {
    x = work.x + work.width - size.width;
    y = storedY != null
      ? clamp(storedY, work.y, work.y + work.height - size.height)
      : Math.round(work.y + (work.height - size.height) / 2);
  } else if (dock === "top") {
    x = storedX != null
      ? clamp(storedX, work.x, work.x + work.width - size.width)
      : Math.round(work.x + (work.width - size.width) / 2);
    y = work.y;
  } else {
    ({ x, y } = centerOnWorkArea(size, work));
  }

  compactAnchor = { x, y };

  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  lastAppliedSize = size;
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  loadRenderer(mainWindow);

  mainWindow.webContents.once("did-finish-load", () => {
    startPolling();
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[side-notch] renderer gone", details.reason, details.exitCode);
    if (details.reason === "clean-exit") return;
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      loadRenderer(mainWindow);
    }, 400);
  });

  mainWindow.on("moved", () => {
    if (!mainWindow || ignoreMoved || Date.now() < ignoreMovedUntil) return;
    rememberAnchorFromBounds(mainWindow.getBounds(), getDock());
    persistAnchor();
    mainWindow.webContents.send("window:dragging");
  });
}

function sendToRenderer(
  channel: "sources:update" | "agents:update" | "agents:error",
  payload: unknown,
): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function legacyAgents(payload: SourcesPayload): AgentSnapshot[] {
  const cursor = payload.sources.find((source) => source.source === "cursor");
  return (cursor?.agents ?? []).map((agent) => ({
    composerId: agent.composerId,
    workspaceId: agent.workspaceId,
    workspacePath: agent.workspacePath,
    name: agent.name,
    subtitle: agent.subtitle,
    contextUsagePercent: agent.contextUsagePercent ?? 0,
    isRunning: agent.isRunning,
    isSubagent: agent.isSubagent,
    parentComposerId: agent.parentComposerId,
    hasBlockingPendingActions: agent.hasBlockingPendingActions,
    linesAdded: agent.linesAdded,
    linesRemoved: agent.linesRemoved,
    filesChanged: agent.filesChanged,
  }));
}

async function collectSources(): Promise<SourcesPayload> {
  const sources = await sourceHub.collect();
  const payload: SourcesPayload = { sources, capturedAt: Date.now() };
  lastSources = payload;
  sendToRenderer("sources:update", payload);
  sendToRenderer("agents:update", legacyAgents(payload));
  notifications.ingest(sources, store.store);
  if (currentMode === "compact" && Date.now() >= ignoreMovedUntil && !ignoreMoved) {
    applyBounds("compact", getDock());
  }
  const line = healthLine(sources);
  tray?.setToolTip(`Side-notch · ${line}`);
  if (!loggedHealth) {
    loggedHealth = true;
    console.log("[side-notch]", line);
  }
  return payload;
}

async function pollSources(): Promise<SourcesPayload> {
  if (pollInFlight) return pollInFlight;
  pollInFlight = collectSources();
  try {
    return await pollInFlight;
  } finally {
    pollInFlight = null;
  }
}

function startPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    void pollSources().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[side-notch] Failed to collect sources:", message);
      sendToRenderer("agents:error", message);
    });
  }, store.get("pollIntervalMs"));
}

function buildTrayMenu(): Electron.Menu {
  const dock = getDock();

  return Menu.buildFromTemplate([
    {
      label: "Centralizar",
      click: () => setDock("floating", { center: true }),
    },
    { type: "separator" },
    {
      label: "Encostar à esquerda",
      type: "radio",
      checked: dock === "left",
      click: () => setDock("left"),
    },
    {
      label: "Encostar à direita",
      type: "radio",
      checked: dock === "right",
      click: () => setDock("right"),
    },
    {
      label: "Encostar no topo",
      type: "radio",
      checked: dock === "top",
      click: () => setDock("top"),
    },
    {
      label: "Flutuante",
      type: "radio",
      checked: dock === "floating",
      click: () => setDock("floating"),
    },
    { type: "separator" },
    {
      label: "Notificações Cursor",
      type: "checkbox",
      checked: store.get("notifyCursor") !== false,
      click: (item) => store.set("notifyCursor", item.checked),
    },
    {
      label: "Notificações Claude",
      type: "checkbox",
      checked: store.get("notifyClaude") !== false,
      click: (item) => store.set("notifyClaude", item.checked),
    },
    {
      label: "Notificações Codex",
      type: "checkbox",
      checked: store.get("notifyCodex") !== false,
      click: (item) => store.set("notifyCodex", item.checked),
    },
    ...(app.isPackaged
      ? ([
          { type: "separator" as const },
          {
            label: "Iniciar com Windows",
            type: "checkbox" as const,
            checked: store.get("launchOnStartup"),
            click: async (item: Electron.MenuItem) => {
              const enabled = item.checked;
              store.set("launchOnStartup", enabled);
              await syncAutoLaunch(enabled);
            },
          },
        ] as const)
      : []),
    { type: "separator" },
    {
      label: "Sair",
      click: () => app.quit(),
    },
  ]);
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(buildTrayMenu());
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  );

  tray = new Tray(icon);
  tray.setToolTip("Side-notch");
  refreshTrayMenu();
}

function createAutoLauncher(): AutoLaunch {
  return new AutoLaunch({
    name: "Side-notch",
    path: app.getPath("exe"),
  });
}

async function clearDevAutoLaunch(): Promise<void> {
  if (app.isPackaged) return;

  try {
    const autoLauncher = createAutoLauncher();
    if (await autoLauncher.isEnabled()) {
      await autoLauncher.disable();
      console.log("[side-notch] Removed stale dev auto-launch entry");
    }
  } catch (error) {
    console.warn("[side-notch] Could not clear dev auto-launch:", error);
  }
}

async function syncAutoLaunch(enabled: boolean): Promise<void> {
  if (!app.isPackaged) {
    await clearDevAutoLaunch();
    return;
  }

  const autoLauncher = createAutoLauncher();
  const isEnabled = await autoLauncher.isEnabled();

  if (enabled && !isEnabled) {
    await autoLauncher.enable();
  } else if (!enabled && isEnabled) {
    await autoLauncher.disable();
  }
}

function registerIpc(): void {
  ipcMain.handle("settings:get", () => store.store);

  ipcMain.handle("settings:set", (_event, partial: Partial<AppSettings>) => {
    for (const [key, value] of Object.entries(partial)) {
      store.set(key as keyof AppSettings, value as never);
    }

    if (partial.pollIntervalMs !== undefined) {
      startPolling();
    }

    if (partial.dock !== undefined) {
      setDock(partial.dock);
    }

    if (partial.launchOnStartup !== undefined) {
      void syncAutoLaunch(partial.launchOnStartup);
    }

    if (
      partial.notifyCursor !== undefined ||
      partial.notifyClaude !== undefined ||
      partial.notifyCodex !== undefined
    ) {
      refreshTrayMenu();
    }

    return store.store;
  });

  ipcMain.handle(
    "window:commit-bounds",
    (_event, mode: ViewMode, options?: CommitBoundsOptions) => {
      return commitMode(mode, options);
    },
  );

  ipcMain.on("window:move", (_event, x: number, y: number) => {
    if (typeof x !== "number" || typeof y !== "number") return;
    moveWindowTo(x, y);
  });

  ipcMain.on("window:mouse-ignore", (_event, ignore: boolean) => {
    setMouseIgnore(Boolean(ignore));
  });

  ipcMain.on("window:end-drag", () => {
    endDrag();
  });

  ipcMain.handle("sources:refresh", () => pollSources());

  ipcMain.handle("window:resize", async (_event, mode: ViewMode) => {
    await commitMode(mode);
  });

  ipcMain.handle("agents:refresh", async () => {
    const payload = await pollSources();
    return legacyAgents(payload);
  });
}

app.commandLine.appendSwitch(
  "disable-features",
  "CalculateNativeWinOcclusion",
);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusOverlay();
  });

  app.whenReady().then(async () => {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.sidenotch.app");
    }
    notifications.setOnToast((toast: NotchToast) => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return;
      }
      mainWindow.show();
      mainWindow.webContents.send("toast:show", toast);
    });
    await clearDevAutoLaunch();
    registerIpc();
    createWindow();
    createTray();
    screen.on("display-added", reflowForDisplayChange);
    screen.on("display-removed", reflowForDisplayChange);
    screen.on("display-metrics-changed", reflowForDisplayChange);

    if (store.get("launchOnStartup")) {
      await syncAutoLaunch(true);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      // Keep running in tray on Windows
    }
  });

  app.on("before-quit", () => {
    if (pollTimer) clearInterval(pollTimer);
    notifications.reset();
  });
}
