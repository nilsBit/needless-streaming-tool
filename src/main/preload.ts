import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectSyncFolder: () => ipcRenderer.invoke('select-sync-folder'),
  onUpdateAvailable: (callback: (data: { version: string; url: string; name: string }) => void) => {
    // The check repeats every few hours; one listener only, even after React's dev double-mount.
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.on('update-available', (_event, data) => callback(data));
  },
  onUpdateDownloaded: (callback: (data: { version: string }) => void) => {
    ipcRenderer.once('update-downloaded', (_event, data) => callback(data));
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),
});
