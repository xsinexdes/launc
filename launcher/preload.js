const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('init'),
  info: () => ipcRenderer.invoke('info'),
  serverStatus: () => ipcRenderer.invoke('server-status'),
  loginMicrosoft: () => ipcRenderer.invoke('login-ms'),
  logout: () => ipcRenderer.invoke('logout'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  play: (o) => ipcRenderer.invoke('play', o),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  repair: () => ipcRenderer.invoke('repair'),
  openLink: (u) => ipcRenderer.send('open-link', u),
  win: (action) => ipcRenderer.send('win', action),
  onStatus: (cb) => ipcRenderer.on('status', (_e, d) => cb(d))
});
