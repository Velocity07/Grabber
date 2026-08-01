const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("grabber", {
  getInfo: () => ipcRenderer.invoke("grabber:info"),
  chooseDestination: () => ipcRenderer.invoke("grabber:chooseDestination"),
  setDestination: (dir) => ipcRenderer.invoke("grabber:setDestination", dir),
  start: (job) => ipcRenderer.invoke("grabber:start", job),
  cancel: (id) => ipcRenderer.invoke("grabber:cancel", id),
  listFiles: () => ipcRenderer.invoke("grabber:listFiles"),
  openPath: (p) => ipcRenderer.invoke("grabber:openPath", p),
  revealPath: (p) => ipcRenderer.invoke("grabber:revealPath", p),
  readTextFile: () => ipcRenderer.invoke("grabber:readTextFile"),
  onProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("grabber:progress", handler);
    return () => ipcRenderer.removeListener("grabber:progress", handler);
  },
});
