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
  saveText: (name, content) => ipcRenderer.invoke('kdl:save-text', { name, content }),
  ollamaDetect: () => ipcRenderer.invoke('kdl:ollama-detect'),
  ollamaGenerate: (model, prompt, num_predict) => ipcRenderer.invoke('kdl:ollama-generate', { model, prompt, num_predict }),
  aiModelInfo: () => ipcRenderer.invoke('kdl:ai-model-info'),
  aiModelDelete: (id) => ipcRenderer.invoke('kdl:ai-model-delete', id),
  aiModelDownload: (id) => ipcRenderer.invoke('kdl:ai-model-download', { id }),
  byokConfig: () => ipcRenderer.invoke('kdl:byok-config'),
  byokSet: (cfg) => ipcRenderer.invoke('kdl:byok-set', cfg),
  byokClear: () => ipcRenderer.invoke('kdl:byok-clear'),
  byokGenerate: (prompt, maxTokens) => ipcRenderer.invoke('kdl:byok-generate', { prompt, maxTokens }),
  dlList: () => ipcRenderer.invoke('kdl:dl-list'),
  dlPause: (id) => ipcRenderer.invoke('kdl:dl-pause', id),
  dlResume: (id) => ipcRenderer.invoke('kdl:dl-resume', id),
  dlCancel: (id) => ipcRenderer.invoke('kdl:dl-cancel', id),
  dlOpen: (id) => ipcRenderer.invoke('kdl:dl-open', id),
  dlFolder: (id) => ipcRenderer.invoke('kdl:dl-folder', id),
  dlRemove: (id) => ipcRenderer.invoke('kdl:dl-remove', id),
  dlClear: () => ipcRenderer.invoke('kdl:dl-clear'),
  dlHash: (id) => ipcRenderer.invoke('kdl:dl-hash', id),
  onDlUpdate: (cb) => ipcRenderer.on('kdl:dl-update', (_e, rec) => cb(rec))
});
