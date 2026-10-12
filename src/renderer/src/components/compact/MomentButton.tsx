import React, { useState } from 'react';
import { apiPost } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';

// "Moment merken" in the compact bar: one tap, no note.
export default function MomentButton() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const mark = async () => {
    setBusy(true);
    const result = await apiPost('/clips', { tag: 'highlight' });
    setBusy(false);
    if (!result) { toast.error('Moment nicht gemerkt'); return; }
    toast.success('Moment gemerkt');
  };
  return (
    <button type="button" className="compact-moment" data-quest-target="moment" onClick={() => void mark()} disabled={busy}>
      {busy ? 'Merke …' : 'Moment'}
    </button>
  );
}
