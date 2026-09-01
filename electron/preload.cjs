const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sideNotch", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (partial) => ipcRenderer.invoke("settings:set", partial),
  resizeWindow: (mode) => ipcRenderer.invoke("window:resize", mode),
  refreshAgents: () => ipcRenderer.invoke("agents:refresh"),
  onAgentsUpdate: (callback) => {
    const listener = (_event, agents) => {
      callback(agents);
    };
    ipcRenderer.on("agents:update", listener);
    return () => ipcRenderer.removeListener("agents:update", listener);
  },
  onAgentsError: (callback) => {
    const listener = (_event, message) => {
      callback(message);
    };
    ipcRenderer.on("agents:error", listener);
    return () => ipcRenderer.removeListener("agents:error", listener);
  },
  onDockChange: (callback) => {
    const listener = (_event, dock) => {
      callback(dock);
    };
    ipcRenderer.on("dock:update", listener);
    return () => ipcRenderer.removeListener("dock:update", listener);
  },
  onWindowDragging: (callback) => {
    const listener = () => {
      callback();
    };
    ipcRenderer.on("window:dragging", listener);
    return () => ipcRenderer.removeListener("window:dragging", listener);
  },
});
