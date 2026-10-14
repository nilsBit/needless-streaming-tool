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
  // Callers pass onClose inline, so it changes on every keystroke. Kept in a ref
  // so the effect runs once — re-running it would pull focus out of the input.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    // An autoFocus field inside wins; otherwise the dialog itself takes focus.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    // Only the topmost dialog closes — one opened from another keeps the first.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const overlays = document.querySelectorAll('.dialog-overlay');
      if (overlays[overlays.length - 1] === ref.current?.parentElement) close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
