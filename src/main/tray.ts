import { Tray, Menu, BrowserWindow, nativeImage } from 'electron';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow) {
  // Create a simple tray icon (16x16 transparent)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setTitle('🔬');
  tray.setToolTip('The Lab — Stream Toolkit');

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
