const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sideNotch", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (partial) => ipcRenderer.invoke("settings:set", partial),
  commitBounds: (mode, options) => ipcRenderer.invoke("window:commit-bounds", mode, options),
  moveWindow: (x, y) => {
    ipcRenderer.send("window:move", x, y);
  },
  setMouseIgnore: (ignore) => {
    ipcRenderer.send("window:mouse-ignore", ignore);
  },
  endDrag: () => {
    ipcRenderer.send("window:end-drag");
  },
  refreshSources: () => ipcRenderer.invoke("sources:refresh"),
  onSourcesUpdate: (callback) => {
    const listener = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on("sources:update", listener);
    return () => ipcRenderer.removeListener("sources:update", listener);
  },
  onDockChange: (callback) => {
    const listener = (_event, dock) => {
      callback(dock);
    };
    ipcRenderer.on("dock:update", listener);
    return () => ipcRenderer.removeListener("dock:update", listener);
  },
  onRequestExpand: (callback) => {
    const listener = () => {
      callback();
    };
    ipcRenderer.on("view:expand", listener);
    return () => ipcRenderer.removeListener("view:expand", listener);
  },
  onToast: (callback) => {
    const listener = (_event, toast) => {
      callback(toast);
    };
    ipcRenderer.on("toast:show", listener);
    return () => ipcRenderer.removeListener("toast:show", listener);
  },
});
