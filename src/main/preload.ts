import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectSyncFolder: () => ipcRenderer.invoke('select-sync-folder'),
  onUpdateAvailable: (callback: (data: { version: string; url: string; name: string }) => void) => {
    // The check runs once per start; React's dev double-mount must not add a second listener.
    ipcRenderer.once('update-available', (_event, data) => callback(data));
  },
  onUpdateDownloaded: (callback: (data: { version: string }) => void) => {
    ipcRenderer.once('update-downloaded', (_event, data) => callback(data));
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),
});
