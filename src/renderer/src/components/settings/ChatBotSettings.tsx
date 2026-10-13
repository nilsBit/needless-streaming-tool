import React, { useState } from 'react';
import { useApi, apiPost, apiFetch } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import Dialog from '../ux/Dialog';

const MINUTES = [10, 15, 20, 30, 45, 60, 90, 120];
const PAUSES = [0, 5, 10, 15, 20, 30, 45, 60, 120];

// "Von selbst" under Chat & Bot (13.10., Leinwand "A · Drei Reiter"): what
// the bot does on its own, one row each — the reminder it says every so
// often, the greeting after a raid and the pause between answers of the
// built-in commands. "Ändern" opens the details, the switch turns it on or
// off. The built-in names moved to Befehle → Eingebaut.
export default function ChatBotSettings() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<'reminder' | 'pause' | null>(null);

  // The bot's own reminder every so often — text and interval; 0 minutes is off.
  const { data: reminderInfo, refetch: refetchReminder } = useApi<{ text: string; minutes: number; default: string; maxMinutes: number }>('/settings/reminder');
  const [lastMinutes, setLastMinutes] = useState(20);
  const saveReminder = async (change: { text?: string; minutes?: number }) => {
    const res = await apiFetch('/settings/reminder', { method: 'POST', body: JSON.stringify(change) });
    if (!res.ok) { toast.error('Erinnerung nicht gespeichert'); return false; }
    refetchReminder();
    return true;
  };
  const reminderOn = (reminderInfo?.minutes ?? 0) > 0;
  const toggleReminder = () => {
    if (reminderOn) { setLastMinutes(reminderInfo!.minutes); void saveReminder({ minutes: 0 }); }
    else void saveReminder({ minutes: lastMinutes });
  };
  const reminderLine = reminderInfo?.text || reminderInfo?.default || '';

  // Greeting after a raid.
  const { data: raidShoutout, refetch: refetchRaidShoutout } = useApi<{ value: string | null }>('/settings/get/raid_shoutout');
  const raidOn = raidShoutout?.value !== '0';
  const toggleRaid = async () => {
    await apiPost('/settings/set', { key: 'raid_shoutout', value: raidOn ? '0' : '1' });
    refetchRaidShoutout();
  };

  // Shared pause of the built-in commands that only say something.
  const { data: builtinCooldown, refetch: refetchBuiltinCooldown } = useApi<{ seconds: number; max: number }>('/settings/builtin-cooldown');
  const pause = builtinCooldown?.seconds ?? 15;
  const savePause = async (seconds: number) => {
    const res = await apiFetch('/settings/builtin-cooldown', { method: 'POST', body: JSON.stringify({ seconds }) });
    if (!res.ok) { toast.error('Pause nicht gespeichert'); return false; }
    refetchBuiltinCooldown();
    return true;
  };

  const onOff = (on: boolean, toggle: () => void, label: string) => (
    <button type="button" className="onoff" aria-pressed={on} aria-label={`${label}: ${on ? 'an' : 'aus'}`} onClick={toggle}>{on ? 'An' : 'Aus'}</button>
  );

  return (
    <div className="selbst-list">
      <div className="selbst-row">
        <div className="selbst-row-text">
          <b>Erinnerung</b>
          <span>{reminderOn ? `Alle ${reminderInfo!.minutes} Minuten: „${reminderLine}“ Nur wenn seitdem jemand geschrieben hat.` : `Aus. Wenn an, sagt der Bot alle paar Minuten: „${reminderLine}“`}</span>
        </div>
        <button type="button" className="card-secondary" onClick={() => setEditing('reminder')}>Ändern</button>
        {onOff(reminderOn, toggleReminder, 'Erinnerung')}
      </div>

      <div className="selbst-row">
        <div className="selbst-row-text">
          <b>Raid-Gruß</b>
          <span>Wer dich raidet, bekommt einen Gruß mit Link zum Kanal und der letzten Kategorie. Von Hand geht es für Mods mit !so Name.</span>
        </div>
        <span />
        {onOff(raidOn, () => void toggleRaid(), 'Raid-Gruß')}
      </div>

      <div className="selbst-row">
        <div className="selbst-row-text">
          <b>Pause zwischen Antworten</b>
          <span>{pause === 0 ? 'Keine Pause: Die eingebauten Befehle antworten jedes Mal.' : `${pause} Sekunden je eingebautem Befehl, in vollem Chat kürzer. Mods und du sind ausgenommen.`}</span>
        </div>
        <button type="button" className="card-secondary" onClick={() => setEditing('pause')}>Ändern</button>
        <span />
      </div>

      {editing === 'reminder' && reminderInfo && (
        <ReminderDialog info={reminderInfo} fallbackMinutes={lastMinutes} onClose={() => setEditing(null)} onSave={saveReminder} />
      )}
      {editing === 'pause' && (
        <PauseDialog seconds={pause} onClose={() => setEditing(null)} onSave={savePause} />
      )}
    </div>
  );
}

function ReminderDialog({ info, fallbackMinutes, onClose, onSave }: {
  info: { text: string; minutes: number; default: string };
  fallbackMinutes: number;
  onClose: () => void;
  onSave: (change: { text?: string; minutes?: number }) => Promise<boolean>;
}) {
  const [text, setText] = useState(info.text);
  const [minutes, setMinutes] = useState(info.minutes || fallbackMinutes);
  const save = async () => {
    if (await onSave({ text, minutes })) onClose();
  };
  return (
    <Dialog
      title="Erinnerung"
      sentence="Der Bot sagt alle paar Minuten einen Satz von selbst – aber nur, wenn seit dem letzten Mal jemand im Chat geschrieben hat."
      onClose={onClose}
      width={560}
      footer={<>
        <span style={{ flex: 1 }} />
        <button type="button" className="card-secondary" onClick={onClose}>Abbrechen</button>
        <button type="button" className="card-primary" onClick={save}>Speichern</button>
      </>}
    >
      <div className="dialog-grid">
        <div className="dialog-field">
          <label htmlFor="reminder-text">Satz – leer lassen für den Standardtext</label>
          <input id="reminder-text" type="text" maxLength={400} placeholder={info.default} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </div>
        <div className="dialog-field">
          <label htmlFor="reminder-minutes">Wie oft</label>
          <select id="reminder-minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {MINUTES.map((m) => <option key={m} value={m}>alle {m} Minuten</option>)}
          </select>
        </div>
      </div>
    </Dialog>
  );
}

function PauseDialog({ seconds, onClose, onSave }: { seconds: number; onClose: () => void; onSave: (seconds: number) => Promise<boolean> }) {
  const [value, setValue] = useState(seconds);
  const save = async () => {
    if (await onSave(value)) onClose();
  };
  return (
    <Dialog
      title="Pause zwischen Antworten"
      sentence="Für die eingebauten Befehle, die nur etwas sagen (!song, !uptime, !projekt, !themen, !queue, !stats, !punkte, !belohnungen, !challenge, !datenschutz, !befehle). Die Pause gilt für einen ruhigen Chat: ab 20 Nachrichten pro Minute halbiert sie sich, ab 60 ist es ein Viertel. Wer die Antwort gerade bekommen hat, bekommt sie frühestens nach dem Vierfachen wieder; Mods und du warten nie."
      onClose={onClose}
      width={560}
      footer={<>
        <span style={{ flex: 1 }} />
        <button type="button" className="card-secondary" onClick={onClose}>Abbrechen</button>
        <button type="button" className="card-primary" onClick={save}>Speichern</button>
      </>}
    >
      <div className="dialog-field">
        <label htmlFor="pause-seconds">Pause</label>
        <select id="pause-seconds" value={value} onChange={(e) => setValue(Number(e.target.value))}>
          {Array.from(new Set([...PAUSES, seconds])).sort((a, b) => a - b).map((s) => <option key={s} value={s}>{s === 0 ? 'Keine' : `${s} Sekunden`}</option>)}
        </select>
      </div>
    </Dialog>
  );
}
