import React, { useState } from 'react';
import { apiPost } from '../hooks/useApi';

type ChatAnswer =
  | { replies: string[] }
  | { replies: null; reason: 'unknown' | 'disabled' | 'cooldown' | 'builtin' };

const NO_REPLY: Record<string, string> = {
  unknown: 'Diesen Befehl gibt es nicht.',
  disabled: 'Ausgeschaltet – der Chat bekommt keine Antwort.',
  cooldown: 'Die Pause läuft – der Chat bekommt gerade keine Antwort.',
  builtin: 'Eingebauter Befehl – der antwortet nur im echten Chat.',
};

// "Ausprobieren" under Chat & Bot: how the bot would answer — without being
// live. Nothing reaches the real chat.
export default function TryCommandsPanel() {
  const [message, setMessage] = useState('');
  const [asViewer, setAsViewer] = useState(true);
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [busy, setBusy] = useState(false);

  const tryOut = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setAnswer(await apiPost<ChatAnswer>('/chat/try', { message, as: asViewer ? 'viewer' : 'streamer' }));
    setBusy(false);
  };

  return (
    <div className="panel card-slim cmd-try">
      <div className="card-row">
        <input
          type="text"
          placeholder="z. B. !figur Mila"
          aria-label="Befehl ausprobieren"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tryOut()}
          autoFocus
        />
        <button type="button" className="card-primary" onClick={tryOut} disabled={busy || !message.trim()}>Ausprobieren</button>
      </div>
      <label className="card-check">
        <input type="checkbox" checked={asViewer} onChange={(e) => setAsViewer(e.target.checked)} />
        <span>Wie ein Zuschauer ohne Mod-Rechte, mit Pause</span>
      </label>
      <div className="cmd-try-answer">
        {answer === null && <span className="dialog-empty">Hier erscheint die Antwort.</span>}
        {answer && answer.replies && answer.replies.map((reply, i) => <p key={i} className="text-command-bubble">{reply}</p>)}
        {answer && !answer.replies && <span className="dialog-empty">{NO_REPLY[answer.reason]}</span>}
      </div>
    </div>
  );
}
