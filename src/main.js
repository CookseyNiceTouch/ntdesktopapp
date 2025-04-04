import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import ElectronStore from 'electron-store';
import { ipcMain } from 'electron';
import { setupAnthropicHandlers } from './electron/anthropic';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Secure storage for auth data
const store = new ElectronStore({
  encryptionKey: 'your-secure-encryption-key', // Change this to a secure value in production
  name: 'auth-store'
});

// Setup auth channels for IPC communication
const setupAuthChannels = () => {
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

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Setup auth channels
  setupAuthChannels();
  
  // Setup Anthropic handlers
  setupAnthropicHandlers();
  
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
