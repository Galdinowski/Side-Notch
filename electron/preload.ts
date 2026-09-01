import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  CommitBoundsOptions,
  NotchToast,
  SourcesPayload,
  ViewMode,
  WidgetDock,
  WindowRect,
} from "./types.js";

contextBridge.exposeInMainWorld("sideNotch", {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:set", partial),
  commitBounds: (mode: ViewMode, options?: CommitBoundsOptions): Promise<WindowRect> =>
    ipcRenderer.invoke("window:commit-bounds", mode, options),
  moveWindow: (x: number, y: number): void => {
    ipcRenderer.send("window:move", x, y);
  },
  setMouseIgnore: (ignore: boolean): void => {
    ipcRenderer.send("window:mouse-ignore", ignore);
  },
  endDrag: (): void => {
    ipcRenderer.send("window:end-drag");
  },
  refreshSources: (): Promise<SourcesPayload> => ipcRenderer.invoke("sources:refresh"),
  onSourcesUpdate: (callback: (payload: SourcesPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: SourcesPayload) => {
      callback(payload);
    };
    ipcRenderer.on("sources:update", listener);
    return () => ipcRenderer.removeListener("sources:update", listener);
  },
  onDockChange: (callback: (dock: WidgetDock) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, dock: WidgetDock) => {
      callback(dock);
    };
    ipcRenderer.on("dock:update", listener);
    return () => ipcRenderer.removeListener("dock:update", listener);
  },
  onRequestExpand: (callback: () => void) => {
    const listener = () => {
      callback();
    };
    ipcRenderer.on("view:expand", listener);
    return () => ipcRenderer.removeListener("view:expand", listener);
  },
  onToast: (callback: (toast: NotchToast) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, toast: NotchToast) => {
      callback(toast);
    };
    ipcRenderer.on("toast:show", listener);
    return () => ipcRenderer.removeListener("toast:show", listener);
  },
});
