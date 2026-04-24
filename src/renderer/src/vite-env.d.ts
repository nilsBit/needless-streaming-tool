/// <reference types="vite/client" />

declare module '*.svg' {
  const src: string;
  export default src;
}

interface ElectronAPI {
  selectSyncFolder: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
