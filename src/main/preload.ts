import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectSyncFolder: () => ipcRenderer.invoke('select-sync-folder'),
});
