import { app, BrowserWindow, nativeImage, ipcMain, dialog, shell, session } from 'electron';
import path from 'path';
import { startServer } from '../server/index';
import { deleteConnectionFile } from '../server/connection-file';
import { syncFromRemote, syncToRemoteOnQuit } from '../server/sync';
import { registerHotkeys, unregisterHotkeys, setHotkeyPort } from './hotkeys';
import { createTray } from './tray';
import { checkForUpdates } from './update-check';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let apiToken: string = '';
let appPort: number = 4000;

const isDev = !app.isPackaged;
// Development-only tools on the server (the Figma "Umsetzen" button) look for this.
if (isDev) process.env.NST_DEV = '1';

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
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // A link out of the app opens in the system browser, never in a second
  // window of ours (which would carry the preload): https pages, and our own
  // server for the overlay previews. Everything else is dropped. The window
  // itself never navigates away from the app (security review 2026-10-06, H4).
  const ownServer = (url: string) => /^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url);
  const openOutside = (url: string) => {
    if (/^https:\/\//.test(url) || ownServer(url)) void shell.openExternal(url);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  const appUrlPrefix = isDev ? 'http://localhost:5273' : 'file://';
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(appUrlPrefix)) return;
    event.preventDefault();
    openOutside(url);
  });

  // CSP for the renderer. In development it comes as a header on the Vite
  // page only ('unsafe-inline' for React Refresh, never eval); in production
  // the built index.html carries it as a meta tag (vite.config.ts), so the
  // header filter does not override the server's own overlay CSP.
  if (isDev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived({ urls: ['http://localhost:5273/*'] }, (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self' http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' http://localhost:*; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' http://localhost:* https://i.scdn.co data: blob:; frame-src http://localhost:*; object-src 'none'; base-uri 'none'"],
        },
      });
    });
  }

  // Pass API token to renderer via URL hash (not visible in server logs)
  if (isDev) {
    mainWindow.loadURL(`http://localhost:5273#token=${apiToken}&port=${appPort}`);
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

  // The renderer needs the clipboard for "Kopieren" and nothing else: no
  // camera, microphone, notifications or location for any page in this session.
  const clipboardOnly = (permission: string) => permission === 'clipboard-sanitized-write';
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(clipboardOnly(permission)));
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => clipboardOnly(permission));

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

  // Check for updates after a short delay (let UI render first)
  setTimeout(() => {
    if (mainWindow) checkForUpdates(mainWindow);
  }, 5000);
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
