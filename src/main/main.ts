import { app, BrowserWindow } from 'electron';
import path from 'path';
import { startServer } from '../server/index';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { createTray } from './tray';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'The Lab — Stream Toolkit',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createTray(mainWindow);
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();
  registerHotkeys();
});

app.on('before-quit', () => {
  isQuitting = true;
  unregisterHotkeys();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});
