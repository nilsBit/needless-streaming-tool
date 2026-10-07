import path from 'path';

export function getUserDataPath(subdir: string): string {
  try {
    const electron = require('electron');
    const electronApp = electron?.app;
    if (electronApp?.isPackaged) {
      return path.join(electronApp.getPath('userData'), subdir);
    }
  } catch {}
  return path.join(process.cwd(), 'data', subdir);
}

/**
 * The overlays that ship with the tool. electron-builder copies them to
 * resources/overlays (extraResources), so the packaged app finds them there —
 * not under the working directory, which is wherever the shortcut started it.
 * In development they are the source folder. Tests point NST_OVERLAYS_DIR at a copy.
 */
export function getBuiltinOverlaysDir(): string {
  if (process.env.NST_OVERLAYS_DIR) return process.env.NST_OVERLAYS_DIR;
  try {
    const electron = require('electron');
    if (electron?.app?.isPackaged) return path.join(process.resourcesPath, 'overlays');
  } catch {}
  return path.join(process.cwd(), 'src', 'overlays');
}
