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

// "Ausprobieren", on top of Chat & Bot → Befehle (13.10., Leinwand "A · Drei
// Reiter"): how the bot would answer — without being live. Asked as the
// streamer, so no pause gets in the way. Nothing reaches the real chat.
export default function TryCommandsPanel() {
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [busy, setBusy] = useState(false);

  const tryOut = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setAnswer(await apiPost<ChatAnswer>('/chat/try', { message, as: 'streamer' }));
    setBusy(false);
  };

  return (
    <section className="chat-try" aria-labelledby="chat-try-h">
      <h2 id="chat-try-h">Ausprobieren</h2>
      <div className="chat-try-row">
        <input
          type="text"
          placeholder="Schreib einen Befehl wie ein Zuschauer, z. B. !projekt"
          aria-label="Befehl ausprobieren"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tryOut()}
        />
        <button type="button" className="card-primary" onClick={tryOut} disabled={busy || !message.trim()}>Ausprobieren</button>
      </div>
      {answer && answer.replies && answer.replies.map((reply, i) => <p key={i} className="chat-bot-line"><b>Bot</b>{reply}</p>)}
      {answer && !answer.replies && <p className="chat-bot-line muted">{NO_REPLY[answer.reason]}</p>}
    </section>
  );
}
