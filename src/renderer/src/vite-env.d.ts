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
  onUpdateDownloaded?: (callback: (data: { version: string }) => void) => void;
  installUpdate?: () => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
