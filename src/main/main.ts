import { app, BrowserWindow } from 'electron';
import path from 'path';
import { startServer } from '../server/index';
import { deleteConnectionFile } from '../server/connection-file';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { createTray } from './tray';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let apiToken: string = '';

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

  // Set CSP
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; style-src 'self' 'unsafe-inline'"],
      },
    });
  });

  // Pass API token to renderer via URL hash (not visible in server logs)
  if (isDev) {
    mainWindow.loadURL(`http://localhost:5173#token=${apiToken}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `token=${apiToken}`,
    });
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
  apiToken = await startServer();
  createWindow();
  registerHotkeys();
});

app.on('before-quit', () => {
  isQuitting = true;
  unregisterHotkeys();
  deleteConnectionFile();
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
