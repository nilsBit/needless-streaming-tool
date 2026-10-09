import React, { useEffect } from 'react';
import { useToast } from './contexts/ToastContext';
import Shell from './Shell';
import { FeaturesProvider } from './contexts/FeaturesContext';

interface UpdateInfo { version: string; url: string }

export default function App() {
  const { toast } = useToast();

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable) return;
    const handler = (data: UpdateInfo) => {
      toast.errorAction({
        message: `Neues Update verfügbar: v${data.version}`,
        action: {
          label: 'Herunterladen',
          onClick: () => window.open(data.url, '_blank'),
        },
      });
    };
    api.onUpdateAvailable(handler);
    // Windows: the update is already downloaded and installs on quit anyway.
    api.onUpdateDownloaded?.((data) => {
      toast.errorAction({
        message: `Update v${data.version} ist bereit`,
        action: {
          label: 'Jetzt neu starten',
          onClick: () => { void api.installUpdate?.(); },
        },
      });
    });
  }, []);

  return <FeaturesProvider><Shell /></FeaturesProvider>;
}
