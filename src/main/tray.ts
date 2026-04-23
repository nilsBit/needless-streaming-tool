import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron';
import path from 'path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow) {
  const isDev = !app.isPackaged;
  const iconPath = isDev
    ? path.join(process.cwd(), 'assets', 'tray-iconTemplate.png')
    : path.join(process.resourcesPath || app.getAppPath(), 'assets', 'tray-iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('NST — Needless Streaming Tool');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Dashboard öffnen',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      click: () => {
        mainWindow.destroy();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click on tray icon opens window
  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}
