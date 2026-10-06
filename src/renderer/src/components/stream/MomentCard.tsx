import React, { useState } from 'react';
import { apiPost } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';

// "Moment merken" during the stream: one note, one button. The moment lands
// under Nach dem Stream → Content planen with the stream timecode, like the
// Stream Deck key and the hotkey do it. Same endpoint as the clips panel.
export default function MomentCard() {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const mark = async () => {
    setBusy(true);
    const result = await apiPost('/clips', { tag: 'highlight', note: note.trim() || undefined });
    setBusy(false);
    if (!result) { toast.error('Moment nicht gemerkt'); return; }
    setNote('');
    toast.success('Moment gemerkt');
  };

  return (
    <div className="moment-card">
      <input
        type="text"
        value={note}
        placeholder="Was gerade passiert (optional)"
        maxLength={200}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void mark(); }}
      />
      <button type="button" className="moment-mark" onClick={() => void mark()} disabled={busy}>
        {busy ? 'Merke …' : 'Jetzt merken'}
      </button>
    </div>
  );
}
