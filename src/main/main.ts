import { app, BrowserWindow, nativeImage, ipcMain, dialog } from 'electron';
import path from 'path';
import { startServer } from '../server/index';
import { deleteConnectionFile } from '../server/connection-file';
import { syncFromRemote, syncToRemoteOnQuit } from '../server/sync';
import { registerHotkeys, unregisterHotkeys, setHotkeyPort } from './hotkeys';
import { createTray } from './tray';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let apiToken: string = '';
let appPort: number = 4000;

const isDev = !app.isPackaged;

function createWindow() {
  const iconPath = isDev
    ? path.join(process.cwd(), 'assets', 'icon.png')
    : path.join(process.resourcesPath || app.getAppPath(), 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'NST — Needless Streaming Tool',
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
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
    mainWindow.loadURL(`http://localhost:5173#token=${apiToken}&port=${appPort}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `token=${apiToken}&port=${appPort}`,
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
  // Set dock icon in dev mode (production uses .icns from electron-builder)
  if (isDev && process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(path.join(process.cwd(), 'assets', 'icon.png'));
    app.dock.setIcon(dockIcon);
  }

  // IPC: folder picker for sync config
  ipcMain.handle('select-sync-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Sync-Ordner auswählen',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Sync from remote before starting server
  const syncResult = syncFromRemote();
  if (syncResult.error) {
    console.warn(`[Sync] ${syncResult.error}`);
  } else if (syncResult.synced) {
    console.log('[Sync] Database updated from remote');
  }

  const serverResult = await startServer();
  apiToken = serverResult.token;
  appPort = serverResult.port;
  setHotkeyPort(appPort);
  createWindow();
  registerHotkeys();
});

app.on('before-quit', () => {
  isQuitting = true;
  unregisterHotkeys();
  syncToRemoteOnQuit();
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
