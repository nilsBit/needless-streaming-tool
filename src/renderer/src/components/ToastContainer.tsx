import React, { useState } from 'react';
import { useToast } from '../i18n/ToastContext';

export default function ToastContainer() {
  const { toasts } = useToast();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (toasts.length === 0) return null;

  const toggleDetails = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <div className="toast-message">{t.message}</div>
          {t.action && (
            <button className="toast-action" onClick={t.action.onClick}>{t.action.label}</button>
          )}
          {t.details && (
            <button className="toast-details-toggle" onClick={() => toggleDetails(t.id)}>
              {expanded.has(t.id) ? 'Details ausblenden' : 'Details anzeigen ▸'}
            </button>
          )}
          {t.details && expanded.has(t.id) && (
            <pre className="toast-details">{t.details}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
