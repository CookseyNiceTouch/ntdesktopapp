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
  createMessage: (options) => {
    console.log('[PRELOAD] Creating message with options:', {
      model: options.model,
      messageCount: options.messages.length
    });
    return ipcRenderer.invoke('anthropic:createMessage', options);
  }
});

// Expose MCP API to renderer process (simplified for server connection only)
contextBridge.exposeInMainWorld('electronMCP', {
  launchServer: (options) => {
    console.log('[PRELOAD] Launching MCP server:', options);
    return ipcRenderer.invoke('mcp:launchServer', options);
  },
  selectServerFile: () => {
    console.log('[PRELOAD] Selecting server file');
    return ipcRenderer.invoke('mcp:selectServerFile');
  },
  closeClient: (options) => {
    console.log('[PRELOAD] Closing MCP client:', options);
    return ipcRenderer.invoke('mcp:closeClient', options);
  },
  callTool: (options) => {
    console.log('[PRELOAD] Calling MCP tool:', {
      clientId: options.clientId,
      toolName: options.toolName
    });
    return ipcRenderer.invoke('mcp:callTool', options);
  }
});
