import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { checkForUpdates } from './update-check';

// Windows fetches updates itself: electron-updater reads latest.yml from the newest
// GitHub release and downloads the installer in the background. It runs only when the
// user clicks "Jetzt neu starten" (security review 15.10.: the app is unsigned, so
// there is no publisher check – a hijacked release must not install on its own at
// the next quit).
// macOS cannot update an unsigned app in place; there, and in dev, the old check stays:
// a toast that links to the release page.
// Both look again every few hours, so a release reaches an app that runs for days.
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

export function startUpdates(mainWindow: BrowserWindow): void {
  if (!app.isPackaged || process.platform !== 'win32') {
    checkForUpdates(mainWindow);
    const timer = setInterval(() => {
      if (mainWindow.isDestroyed()) { clearInterval(timer); return; }
      checkForUpdates(mainWindow);
    }, CHECK_EVERY_MS);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = {
    info: (msg: unknown) => console.log('[Update]', msg),
    warn: (msg: unknown) => console.warn('[Update]', msg),
    error: (msg: unknown) => console.warn('[Update]', msg),
    debug: () => {},
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  const check = () => {
    // Silent fail — no internet or no release is fine.
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[Update] Check failed:', err instanceof Error ? err.message : err);
    });
  };

  autoUpdater.on('update-downloaded', (info) => {
    // One downloaded update is enough; it waits for "Jetzt neu starten".
    if (timer) { clearInterval(timer); timer = null; }
    console.log(`[Update] v${info.version} downloaded, waits for the click`);
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', { version: info.version });
    }
  });

  ipcMain.handle('install-update', () => {
    // isSilent: no installer window; isForceRunAfter: start the new version afterwards.
    autoUpdater.quitAndInstall(true, true);
  });

  check();
  timer = setInterval(check, CHECK_EVERY_MS);
}
