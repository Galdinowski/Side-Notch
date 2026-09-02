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
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import AutoLaunch from "auto-launch";
import {
  centerOnWorkArea,
  clamp,
  compactAnchorFromBounds,
  compactSize,
  fitInWork,
  isCornerDock,
  positionForSize as dockedPosition,
  resolveDock,
  sizeForMode,
} from "./layout.js";
import { NotificationHub } from "./notifications.js";
import { SourceHub } from "./sources/collect.js";
import type {
  AppSettings,
  CommitBoundsOptions,
  NotchToast,
  SourcesPayload,
  ViewMode,
  WidgetDock,
  WindowRect,
} from "./types.js";
import { healthLine, inUseSources, isWidgetDock, visibleSources, panelSources } from "./types.js";

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
let lastSourcesFingerprint = "";
let lastAppliedSize = { width: 0, height: 0 };
let loggedHealth = false;
let ignoreMoved = false;
let compactAnchor = { x: 0, y: 0 };
let visitSlotCount = 1;

const isDev = !app.isPackaged;
const POLL_IDLE_MS = 6000;
let ignoreMovedUntil = 0;
let isQuitting = false;

function getPreloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function getIndexHtmlPath(): string {
  return path.join(app.getAppPath(), "dist", "index.html");
}

function resolveAsset(...parts: string[]): string | null {
  const candidates = [
    path.join(app.getAppPath(), ...parts),
    path.join(__dirname, "..", "..", ...parts),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function trayImage(): Electron.NativeImage {
  const png = resolveAsset("public", "icon.png");
  if (png) {
    const image = nativeImage.createFromPath(png);
    if (!image.isEmpty()) return image.resize({ width: 16, height: 16 });
  }
  return nativeImage.createEmpty();
}

function showOverlay(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
}

function loadRenderer(window: BrowserWindow): void {
  if (isDev) {
    void window.loadURL("http://127.0.0.1:5173");
    return;
  }
  void window.loadFile(getIndexHtmlPath());
}

function getDock(): WidgetDock {
  const dock = store.get("dock");
  return isWidgetDock(dock) ? dock : "floating";
}

function compactSlotCount(): number {
  if (!lastSources) return 0;
  return visibleSources(lastSources.sources).length;
}

function panelCount(): number {
  if (!lastSources) return 1;
  return Math.max(1, panelSources(lastSources.sources).length);
}

function slotCount(mode: ViewMode = currentMode): number {
  if (mode === "compact") return compactSlotCount();
  return visitSlotCount;
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

function rememberAnchorFromBounds(
  bounds: Electron.Rectangle,
  dock: WidgetDock,
): void {
  compactAnchor = compactAnchorFromBounds(
    bounds,
    dock,
    compactSize(dock, compactSlotCount()),
  );
}

function positionForSize(
  size: { width: number; height: number },
  dock: WidgetDock,
  work: Electron.Rectangle,
  options?: { center?: boolean },
): { x: number; y: number } {
  const fallback = compactSize(dock, compactSlotCount());
  const prevSize = {
    width: lastAppliedSize.width > 0 ? lastAppliedSize.width : fallback.width,
    height: lastAppliedSize.height > 0 ? lastAppliedSize.height : fallback.height,
  };
  return dockedPosition(size, dock, work, compactAnchor, prevSize, options);
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

  if (!options?.center && (dock === "top" || isCornerDock(dock))) {
    const work = workAreaForWindow();
    const size = sizeForMode(currentMode, dock, slotCount(), work.height);
    compactAnchor = dockedPosition(size, dock, work, compactAnchor, size);
  }

  applyBounds(currentMode, dock, options);
}

function commitMode(mode: ViewMode, options?: CommitBoundsOptions): WindowRect {
  currentMode = mode;
  if (mode === "compact") {
    visitSlotCount = panelCount();
  } else if (options?.slotCount != null) {
    visitSlotCount = Math.max(0, options.slotCount);
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
  if (nextDock === "left" || nextDock === "bottom-left") ax = work.x;
  else if (nextDock === "right" || nextDock === "bottom-right") {
    ax = work.x + work.width - size.width;
  } else if (nextDock === "top") {
    ay = work.y;
    if (currentDock !== "top") {
      ax = Math.round(work.x + (work.width - size.width) / 2);
    }
  }
  if (nextDock === "bottom-left" || nextDock === "bottom-right") {
    ay = work.y + work.height - size.height;
  }
  ({ x: ax, y: ay } = fitInWork(ax, ay, size, work));
  if (nextDock === "top") ay = work.y;
  if (nextDock === "bottom-left" || nextDock === "bottom-right") {
    ay = work.y + work.height - size.height;
  }

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
  } else if (dock === "bottom-left") {
    x = work.x;
    y = work.y + work.height - size.height;
  } else if (dock === "bottom-right") {
    x = work.x + work.width - size.width;
    y = work.y + work.height - size.height;
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

  mainWindow.on("close", (event) => {
    if (!isQuitting && process.platform === "win32") {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
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
  });
}

function sendToRenderer(channel: "sources:update", payload: SourcesPayload): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

async function collectSources(): Promise<SourcesPayload> {
  const sources = await sourceHub.collect();
  const payload: SourcesPayload = { sources, capturedAt: Date.now() };
  lastSources = payload;
  const fingerprint = JSON.stringify(sources);
  if (fingerprint === lastSourcesFingerprint) return payload;
  lastSourcesFingerprint = fingerprint;
  sendToRenderer("sources:update", payload);
  notifications.ingest(sources, store.store);
  if (currentMode === "compact" && Date.now() >= ignoreMovedUntil && !ignoreMoved) {
    const nextSize = sizeForMode("compact", getDock(), compactSlotCount(), workAreaForWindow().height);
    if (
      nextSize.width !== lastAppliedSize.width ||
      nextSize.height !== lastAppliedSize.height
    ) {
      applyBounds("compact", getDock());
    }
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

function pollDelayMs(sources: SourcesPayload["sources"]): number {
  const active = store.get("pollIntervalMs") ?? 1500;
  return inUseSources(sources).length > 0 ? active : POLL_IDLE_MS;
}

function stopPolling(): void {
  if (!pollTimer) return;
  clearTimeout(pollTimer);
  pollTimer = null;
}

function scheduleNextPoll(sources: SourcesPayload["sources"]): void {
  stopPolling();
  pollTimer = setTimeout(() => {
    pollTimer = null;
    void runPollLoop();
  }, pollDelayMs(sources));
}

async function runPollLoop(): Promise<void> {
  try {
    const payload = await pollSources();
    scheduleNextPoll(payload.sources);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[side-notch] Failed to collect sources:", message);
    scheduleNextPoll(lastSources?.sources ?? []);
  }
}

function startPolling(): void {
  stopPolling();
  void runPollLoop();
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
      label: "Encostar no canto inferior esquerdo",
      type: "radio",
      checked: dock === "bottom-left",
      click: () => setDock("bottom-left"),
    },
    {
      label: "Encostar no canto inferior direito",
      type: "radio",
      checked: dock === "bottom-right",
      click: () => setDock("bottom-right"),
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
  tray = new Tray(trayImage());
  tray.setToolTip("Side-notch");
  tray.on("click", () => {
    showOverlay();
  });
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
    isQuitting = true;
    stopPolling();
    sourceHub.dispose();
    notifications.reset();
  });
}
