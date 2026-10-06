import React, { useState, useEffect } from 'react';
import { useApi, apiPost, apiFetch } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';

// What the bot does on its own: the reminder it says every so often, the
// shoutout after a raid, the pause between answers of the built-in commands,
// and the names of those built-in commands. Moved here from the old
// Settings → Features → "Chat Commands" card; behaviour and API calls unchanged.
export default function ChatBotSettings() {
  const { toast } = useToast();

  // The bot's own reminder every so often — text and interval.
  const { data: reminderInfo, refetch: refetchReminder } = useApi<{ text: string; minutes: number; default: string; maxMinutes: number }>('/settings/reminder');
  const [reminderText, setReminderText] = useState<string | null>(null);
  const saveReminder = async (change: { text?: string; minutes?: number }) => {
    const res = await apiFetch('/settings/reminder', { method: 'POST', body: JSON.stringify(change) });
    if (!res.ok) { toast.error('Erinnerung nicht gespeichert'); return; }
    setReminderText(null);
    refetchReminder();
  };

  // Shoutout after a raid.
  const { data: raidShoutout, refetch: refetchRaidShoutout } = useApi<{ value: string | null }>('/settings/get/raid_shoutout');
  const raidShoutoutOn = raidShoutout?.value !== '0';
  const setRaidShoutout = async (on: boolean) => {
    await apiPost('/settings/set', { key: 'raid_shoutout', value: on ? '1' : '0' });
    refetchRaidShoutout();
  };

  // Shared cooldown of the built-in commands that only say something.
  const { data: builtinCooldown, refetch: refetchBuiltinCooldown } = useApi<{ seconds: number; max: number }>('/settings/builtin-cooldown');
  const saveBuiltinCooldown = async (seconds: number) => {
    const res = await apiFetch('/settings/builtin-cooldown', { method: 'POST', body: JSON.stringify({ seconds }) });
    if (!res.ok) { toast.error('Pause nicht gespeichert'); return; }
    refetchBuiltinCooldown();
  };

  // Names of the built-in commands.
  const { data: commandsData, refetch: refetchCommands } = useApi<Record<string, string>>('/settings/commands');
  const [editCommands, setEditCommands] = useState<Record<string, string>>({});
  const [commandsLoaded, setCommandsLoaded] = useState(false);
  useEffect(() => {
    if (commandsData && !commandsLoaded) {
      setEditCommands(commandsData);
      setCommandsLoaded(true);
    }
  }, [commandsData, commandsLoaded]);
  const saveCommands = async () => {
    const result = await apiPost('/settings/commands', editCommands);
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    toast.success('Namen gespeichert'); refetchCommands();
  };

  return (
    <div className="panel settings-cards">
      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <div>
              <div className="s-card-title">Erinnerung</div>
              <div className="s-card-status" style={{ color: '#888' }}>
                Der Bot sagt alle paar Minuten einen Satz von selbst – aber nur, wenn seit dem letzten Mal jemand im Chat geschrieben hat. Leer = Standardtext.
              </div>
            </div>
          </div>
        </div>
        <div className="s-card-body">
          <div className="s-command-row">
            <span className="s-command-label">Wie oft</span>
            <select
              className="s-alert-select" style={{ flex: '0 0 170px' }}
              value={reminderInfo?.minutes ?? 0}
              onChange={(e) => saveReminder({ minutes: Number(e.target.value) })}
            >
              <option value={0}>Aus</option>
              {[10, 15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>alle {m} Minuten</option>)}
            </select>
          </div>
          <div className="s-command-row">
            <span className="s-command-label">Satz</span>
            <input
              type="text" maxLength={400}
              placeholder={reminderInfo?.default ?? ''}
              value={reminderText ?? reminderInfo?.text ?? ''}
              onChange={(e) => setReminderText(e.target.value)}
              onBlur={() => reminderText !== null && saveReminder({ text: reminderText })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <div>
              <div className="s-card-title">Shoutout nach einem Raid</div>
              <div className="s-card-status" style={{ color: '#888' }}>
                Kommt jemand mit einem Raid, empfiehlt der Bot dessen Kanal mit der letzten Kategorie. Von Hand geht es für Mods mit !so Name.
              </div>
            </div>
          </div>
          <div className="s-toggle-row compact">
            <button className={`s-toggle-btn ${raidShoutoutOn ? 'active' : ''}`} onClick={() => setRaidShoutout(true)}>An</button>
            <button className={`s-toggle-btn ${!raidShoutoutOn ? 'active' : ''}`} onClick={() => setRaidShoutout(false)}>Aus</button>
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <div>
              <div className="s-card-title">Pause zwischen Antworten</div>
              <div className="s-card-status" style={{ color: '#888' }}>
                Für die eingebauten Befehle, die nur etwas sagen (!song, !uptime, !progress, !todo, !themen, !queue, !stats, !challenge, !befehle).
                Die Pause gilt für einen ruhigen Chat: ab 20 Nachrichten pro Minute halbiert sie sich, ab 60 ist es ein Viertel.
                Wer die Antwort gerade bekommen hat, bekommt sie frühestens nach dem Vierfachen wieder; Mods und du warten nie.
              </div>
            </div>
          </div>
          <select
            className="s-alert-select" style={{ flex: '0 0 150px' }}
            aria-label="Pause in Sekunden"
            value={builtinCooldown?.seconds ?? 15}
            onChange={(e) => saveBuiltinCooldown(Number(e.target.value))}
          >
            {[0, 5, 10, 15, 20, 30, 45, 60, 120].map((s) => <option key={s} value={s}>{s === 0 ? 'Keine' : `${s} Sekunden`}</option>)}
          </select>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <div>
              <div className="s-card-title">Namen der eingebauten Befehle</div>
              <div className="s-card-status" style={{ color: '#888' }}>
                Alle Befehle beginnen mit !. !commands und !help antworten wie !befehle.
              </div>
            </div>
          </div>
        </div>
        <div className="s-card-body">
          {Object.entries(editCommands).map(([key, value]) => (
            <div key={key} className="s-command-row">
              <span className="s-command-label">{key}</span>
              <input type="text" value={value} onChange={e => setEditCommands(prev => ({ ...prev, [key]: e.target.value }))} />
            </div>
          ))}
          <button className="s-card-action primary" onClick={saveCommands}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
