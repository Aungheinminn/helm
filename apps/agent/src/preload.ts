import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("helm", {
  state: () => ipcRenderer.invoke("state"),
  rotateCode: () => ipcRenderer.invoke("rotate-code"),
  revoke: (id: string) => ipcRenderer.invoke("revoke", id),
  quit: () => ipcRenderer.invoke("quit"),
});
