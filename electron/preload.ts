import { contextBridge, ipcRenderer } from "electron";
import type { AgentSnapshot, AppSettings, ViewMode, WidgetDock } from "./types.js";

contextBridge.exposeInMainWorld("sideNotch", {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:set", partial),
  resizeWindow: (mode: ViewMode): Promise<void> =>
    ipcRenderer.invoke("window:resize", mode),
  refreshAgents: (): Promise<AgentSnapshot[]> => ipcRenderer.invoke("agents:refresh"),
  onAgentsUpdate: (callback: (agents: AgentSnapshot[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, agents: AgentSnapshot[]) => {
      callback(agents);
    };
    ipcRenderer.on("agents:update", listener);
    return () => ipcRenderer.removeListener("agents:update", listener);
  },
  onAgentsError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => {
      callback(message);
    };
    ipcRenderer.on("agents:error", listener);
    return () => ipcRenderer.removeListener("agents:error", listener);
  },
  onDockChange: (callback: (dock: WidgetDock) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, dock: WidgetDock) => {
      callback(dock);
    };
    ipcRenderer.on("dock:update", listener);
    return () => ipcRenderer.removeListener("dock:update", listener);
  },
  onWindowDragging: (callback: () => void) => {
    const listener = () => {
      callback();
    };
    ipcRenderer.on("window:dragging", listener);
    return () => ipcRenderer.removeListener("window:dragging", listener);
  },
});
