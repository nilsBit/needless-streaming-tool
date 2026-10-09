import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { checkForUpdates } from './update-check';

// Windows installs updates itself: electron-updater reads latest.yml from the newest
// GitHub release, downloads the installer in the background and runs it when the app
// quits (or right away, when the user clicks "Jetzt neu starten"). The app is unsigned,
// so no publisher check — the download comes over https from this repo's releases.
// macOS cannot update an unsigned app in place; there, and in dev, the old check stays:
// a toast that links to the release page.
export function startUpdates(mainWindow: BrowserWindow): void {
  if (!app.isPackaged || process.platform !== 'win32') {
    checkForUpdates(mainWindow);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (msg: unknown) => console.log('[Update]', msg),
    warn: (msg: unknown) => console.warn('[Update]', msg),
    error: (msg: unknown) => console.warn('[Update]', msg),
    debug: () => {},
  };

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Update] v${info.version} downloaded, installs on quit`);
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', { version: info.version });
    }
  });

  ipcMain.handle('install-update', () => {
    // isSilent: no installer window; isForceRunAfter: start the new version afterwards.
    autoUpdater.quitAndInstall(true, true);
  });

  // Silent fail — no internet or no release is fine.
  autoUpdater.checkForUpdates().catch((err) => {
    console.warn('[Update] Check failed:', err instanceof Error ? err.message : err);
  });
}
