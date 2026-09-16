const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  chooseWorkbook: (title) => ipcRenderer.invoke("choose-workbook", title)
});
