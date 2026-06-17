'use strict';

// Preload minimal : expose une API réduite et nommée, aucun accès Node aux pages.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kdl', {
  clearSiteData: (origin) => ipcRenderer.invoke('kdl:clear-site-data', origin),
  clearAll: () => ipcRenderer.invoke('kdl:clear-all'),
  screenshot: (wcId) => ipcRenderer.invoke('kdl:screenshot', wcId),
  thirdPartyCookies: (enabled) => ipcRenderer.invoke('kdl:third-party-cookies', enabled),
  detectTor: () => ipcRenderer.invoke('kdl:detect-tor'),
  openTor: (url) => ipcRenderer.invoke('kdl:open-tor', url),
  openExternal: (url) => ipcRenderer.invoke('kdl:open-external', url),
  about: () => ipcRenderer.invoke('kdl:about'),
  exportFavs: (data) => ipcRenderer.invoke('kdl:export-favs', data),
  importFavs: () => ipcRenderer.invoke('kdl:import-favs'),
  onDownload: (cb) => ipcRenderer.on('kdl:download', (_e, info) => cb(info))
});
