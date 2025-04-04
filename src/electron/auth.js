import { ipcMain, ipcRenderer, contextBridge } from 'electron';
import ElectronStore from 'electron-store';

// Secure storage for auth data
const store = new ElectronStore({
  encryptionKey: 'your-secure-encryption-key', // Change this to a secure value in production
  name: 'auth-store'
});

// Main process
export const setupAuthChannels = () => {
  ipcMain.handle('auth:getToken', async () => {
    return store.get('authToken');
  });
  
  ipcMain.handle('auth:setToken', async (_, token) => {
    store.set('authToken', token);
    return true;
  });
  
  ipcMain.handle('auth:clearToken', async () => {
    store.delete('authToken');
    return true;
  });
};

// Renderer process API
export const electronAuthAPI = {
  getAuthToken: () => ipcRenderer.invoke('auth:getToken'),
  setAuthToken: (token) => ipcRenderer.invoke('auth:setToken', token),
  clearAuthToken: () => ipcRenderer.invoke('auth:clearToken')
};

// For use in preload script
export const exposeAuthAPI = () => {
  contextBridge.exposeInMainWorld('electronAuth', electronAuthAPI);
}; 