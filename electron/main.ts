import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import AutoLaunch from "auto-launch";
import { CursorReader } from "./cursor-reader.js";
import type { AppSettings, ViewMode, WidgetDock } from "./types.js";

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

const cursorReader = new CursorReader();
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let currentMode: ViewMode = "compact";
let dragEndTimer: NodeJS.Timeout | null = null;
let ignoreMoved = false;
let lastDragPos = { x: 0, y: 0 };

const isDev = !app.isPackaged;
const SNAP_IN = 22;
const SNAP_OUT = 88;

const FLOAT_SIZES: Record<ViewMode, { width: number; height: number }> = {
  compact: { width: 172, height: 42 },
  preview: { width: 480, height: 280 },
  expanded: { width: 520, height: 420 },
  toast: { width: 404, height: 120 },
};

const SIDE_SIZES: Record<ViewMode, { width: number; height: number }> = {
  compact: { width: 72, height: 124 },
  preview: { width: 420, height: 320 },
  expanded: { width: 500, height: 560 },
  toast: { width: 320, height: 132 },
};

function getPreloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function getDock(): WidgetDock {
  return store.get("dock") ?? "floating";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function workAreaForWindow(): Electron.Rectangle {
  if (!mainWindow) return screen.getPrimaryDisplay().workArea;
  return screen.getDisplayMatching(mainWindow.getBounds()).workArea;
}

function sizeFor(mode: ViewMode, dock: WidgetDock, workHeight: number) {
  const sizes = dock === "floating" ? FLOAT_SIZES : SIDE_SIZES;
  const size = sizes[mode];
  return {
    width: size.width,
    height: Math.min(size.height, workHeight - 16),
  };
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

function resolveDock(bounds: Electron.Rectangle, work: Electron.Rectangle, current: WidgetDock): WidgetDock {
  const distLeft = bounds.x - work.x;
  const distRight = work.x + work.width - (bounds.x + bounds.width);

  if (current === "left") {
    return distLeft <= SNAP_OUT ? "left" : "floating";
  }
  if (current === "right") {
    return distRight <= SNAP_OUT ? "right" : "floating";
  }
  if (distLeft <= SNAP_IN) return "left";
  if (distRight <= SNAP_IN) return "right";
  return "floating";
}

function persistPosition(x: number, y: number): void {
  store.set("windowX", x);
  store.set("windowY", y);
}

function sendDock(dock: WidgetDock): void {
  mainWindow?.webContents.send("dock:update", dock);
}

function applyBounds(
  mode: ViewMode,
  dock: WidgetDock,
  options?: { center?: boolean; fromDock?: WidgetDock },
): void {
  if (!mainWindow) return;

  const work = options?.center ? screen.getPrimaryDisplay().workArea : workAreaForWindow();
  const size = sizeFor(mode, dock, work.height);
  const current = mainWindow.getBounds();

  let x: number;
  let y: number;

  if (options?.center) {
    ({ x, y } = centerOnWorkArea(size, work));
  } else if (dock === "left") {
    x = work.x;
    y = clamp(current.y, work.y, work.y + work.height - size.height);
  } else if (dock === "right") {
    x = work.x + work.width - size.width;
    y = clamp(current.y, work.y, work.y + work.height - size.height);
  } else {
    const cx = current.x + current.width / 2;
    x = Math.round(cx - size.width / 2);
    y = current.y;

    if (options?.fromDock === "left") {
      x = Math.max(x, work.x + SNAP_OUT + 12);
    } else if (options?.fromDock === "right") {
      x = Math.min(x, work.x + work.width - size.width - SNAP_OUT - 12);
    }

    x = clamp(x, work.x, work.x + work.width - size.width);
    y = clamp(y, work.y, work.y + work.height - size.height);
  }

  ignoreMoved = true;
  mainWindow.setBounds({ x, y, width: size.width, height: size.height }, false);
  persistPosition(x, y);
  lastDragPos = { x, y };
  queueMicrotask(() => {
    ignoreMoved = false;
  });
}

function setDock(dock: WidgetDock, options?: { center?: boolean }): void {
  const prev = getDock();
  store.set("dock", dock);

  if (dock === "floating" && prev !== "floating") {
    sendDock(dock);
    applyBounds(currentMode, dock, { ...options, fromDock: prev });
  } else {
    applyBounds(currentMode, dock, { ...options, fromDock: prev });
    sendDock(dock);
  }

  refreshTrayMenu();
}

function handleDragEnd(): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const work = screen.getDisplayMatching(bounds).workArea;
  const nextDock = resolveDock(bounds, work, getDock());
  persistPosition(bounds.x, bounds.y);

  if (nextDock !== getDock()) {
    setDock(nextDock);
    return;
  }

  if (nextDock !== "floating") {
    applyBounds(currentMode, nextDock);
  }
}

function resizeWindow(mode: ViewMode): void {
  currentMode = mode;
  applyBounds(mode, getDock());
}

function createWindow(): void {
  const dock = getDock();
  const work = screen.getPrimaryDisplay().workArea;
  const size = sizeFor("compact", dock, work.height);

  let x: number;
  let y: number;

  if (store.has("windowX") && store.has("windowY") && dock === "floating") {
    x = clamp(store.get("windowX") as number, work.x, work.x + work.width - size.width);
    y = clamp(store.get("windowY") as number, work.y, work.y + work.height - size.height);
  } else if (dock === "left") {
    x = work.x;
    y = store.has("windowY")
      ? clamp(store.get("windowY") as number, work.y, work.y + work.height - size.height)
      : Math.round(work.y + (work.height - size.height) / 2);
  } else if (dock === "right") {
    x = work.x + work.width - size.width;
    y = store.has("windowY")
      ? clamp(store.get("windowY") as number, work.y, work.y + work.height - size.height)
      : Math.round(work.y + (work.height - size.height) / 2);
  } else {
    ({ x, y } = centerOnWorkArea(size, work));
  }

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

  lastDragPos = { x, y };
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) {
    void mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.once("did-finish-load", () => {
    void pollAgents();
    startPolling();
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("moved", () => {
    if (!mainWindow || ignoreMoved) return;
    const [winX, winY] = mainWindow.getPosition();
    if (Math.hypot(winX - lastDragPos.x, winY - lastDragPos.y) < 3) return;

    lastDragPos = { x: winX, y: winY };
    persistPosition(winX, winY);
    mainWindow.webContents.send("window:dragging");

    if (dragEndTimer) clearTimeout(dragEndTimer);
    dragEndTimer = setTimeout(() => {
      handleDragEnd();
    }, 140);
  });
}

function sendToRenderer(channel: "agents:update" | "agents:error", payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function pollAgents(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  void cursorReader
    .getActiveAgents()
    .then((agents) => {
      sendToRenderer("agents:update", agents);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[side-notch] Failed to read Cursor agents:", message);
      sendToRenderer("agents:error", message);
    });
}

function startPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    pollAgents();
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
      label: "Flutuante",
      type: "radio",
      checked: dock === "floating",
      click: () => setDock("floating"),
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

    return store.store;
  });

  ipcMain.handle("window:resize", (_event, mode: ViewMode) => {
    resizeWindow(mode);
  });

  ipcMain.handle("agents:refresh", () => cursorReader.getActiveAgents());
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await clearDevAutoLaunch();
    registerIpc();
    createWindow();
    createTray();

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
    if (dragEndTimer) clearTimeout(dragEndTimer);
  });
}
