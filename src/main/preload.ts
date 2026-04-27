import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectSyncFolder: () => ipcRenderer.invoke('select-sync-folder'),
  onUpdateAvailable: (callback: (data: { version: string; url: string; name: string }) => void) => {
    ipcRenderer.on('update-available', (_event, data) => callback(data));
  },
});
