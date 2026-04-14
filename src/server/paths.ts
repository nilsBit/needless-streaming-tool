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
