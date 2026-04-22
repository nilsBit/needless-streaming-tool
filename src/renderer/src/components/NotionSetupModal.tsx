import React, { useEffect } from 'react';
import NotionStep from './onboarding/NotionStep';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function NotionSetupModal({ open, onClose, onComplete }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="notion-setup-backdrop" onClick={onClose}>
      <div className="notion-setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-setup-modal-header">
          <span>Notion einrichten</span>
          <button className="notion-setup-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="notion-setup-modal-body">
          <NotionStep onComplete={onComplete} />
        </div>
      </div>
    </div>
  );
}
