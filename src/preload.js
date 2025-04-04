// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

// Expose auth API to renderer process
contextBridge.exposeInMainWorld('electronAuth', {
  getAuthToken: () => ipcRenderer.invoke('auth:getToken'),
  setAuthToken: (token) => ipcRenderer.invoke('auth:setToken', token),
  clearAuthToken: () => ipcRenderer.invoke('auth:clearToken')
});

// Expose Anthropic API to renderer process
contextBridge.exposeInMainWorld('electronAnthropic', {
  init: (apiKey) => ipcRenderer.invoke('anthropic:init', apiKey),
  createMessage: (options) => ipcRenderer.invoke('anthropic:createMessage', options)
});
