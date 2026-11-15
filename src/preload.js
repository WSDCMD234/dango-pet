const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  on: (ch, fn) => ipcRenderer.on(ch, (_, v) => fn(v)),
  send: (ch, v) => ipcRenderer.send(ch, v),
  invoke: (ch, v) => ipcRenderer.invoke(ch, v),
});
