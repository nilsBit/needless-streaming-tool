import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  /** One sentence under the title, optional. */
  sentence?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Buttons for the bottom row; "Fertig" is added when nothing is given. */
  footer?: React.ReactNode;
  /** Width in px; the dialog never exceeds the window. */
  width?: number;
}

// Editing happens in a dialog in the middle of the window — nothing unfolds at
// the bottom or the side (desktop app, the window can be narrow). Escape and a
// click on the dark backdrop close it. Rendered into <body>, so it inherits
// nothing from the panel that opened it. The shared building block of the rebuild.
export default function Dialog({ title, sentence, onClose, children, footer, width = 720 }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="dialog-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="dialog" style={{ width }}>
        <div className="dialog-head">
          <div>
            <h2>{title}</h2>
            {sentence && <p>{sentence}</p>}
          </div>
          <button type="button" className="card-secondary" onClick={onClose}>Schließen</button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">
          {footer ?? <button type="button" className="card-primary" onClick={onClose}>Fertig</button>}
        </div>
      </section>
    </div>,
    document.body,
  );
}
