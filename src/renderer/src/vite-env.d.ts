/// <reference types="vite/client" />

declare module '*.svg' {
  const src: string;
  export default src;
}

interface UpdateInfo {
  version: string;
  url: string;
  name: string;
}

interface ElectronAPI {
  selectSyncFolder: () => Promise<string | null>;
  onUpdateAvailable: (callback: (data: UpdateInfo) => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
