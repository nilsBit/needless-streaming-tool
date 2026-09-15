import React, { useEffect, useState } from 'react';
import { apiDelete, apiFetch, apiGet, apiPatch, apiPost, useApi } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import EmptyState from '../components/ux/EmptyState';
import ChatCommands from '../components/ChatCommands';

interface TextCommand {
  id: number;
  trigger: string;
  response: string;
  cooldown_seconds: number;
  enabled: boolean;
}

interface LookupCommand {
  id: number;
  trigger: string;
  art: string;
  cooldown_seconds: number;
  enabled: boolean;
}

interface Draft {
  id: number | null;
  trigger: string;
  response: string;
  cooldown_seconds: number;
  enabled: boolean;
}

interface Preview {
  messages: string[];
  max: number;
}

type ChatAnswer =
  | { replies: string[] }
  | { replies: null; reason: 'unknown' | 'disabled' | 'cooldown' | 'builtin' };

const EMPTY_DRAFT: Draft = { id: null, trigger: '', response: '', cooldown_seconds: 30, enabled: true };

const SUGGESTIONS = [
  { trigger: '!story', hint: 'Worum geht es in der Geschichte?' },
  { trigger: '!welt', hint: 'Wo spielt das Ganze?' },
  { trigger: '!stream', hint: 'Was passiert hier eigentlich?' },
  { trigger: '!zeitplan', hint: 'Wann wird gestreamt?' },
];

const NO_REPLY: Record<string, string> = {
  unknown: 'Diesen Befehl gibt es nicht.',
  disabled: 'Ausgeschaltet — der Chat bekommt keine Antwort.',
  cooldown: 'Cooldown läuft — der Chat bekommt gerade keine Antwort.',
  builtin: 'Eingebauter Befehl — der antwortet nur im echten Chat.',
};

/** A write that hands back the server's own words when it refuses. */
async function save(method: 'POST' | 'PATCH', endpoint: string, body: unknown): Promise<string | null> {
  try {
    const res = await apiFetch(endpoint, { method, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.message || 'Speichern fehlgeschlagen';
  } catch {
    return 'Server nicht erreichbar';
  }
}

export default function TextCommandsPanel() {
  const { toast } = useToast();
  const { data: commands, loading, refetch } = useApi<TextCommand[]>('/text-commands');
  const { data: lookups, refetch: refetchLookups } = useApi<LookupCommand[]>('/lookup-commands');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [trial, setTrial] = useState('');
  const [trialAnswer, setTrialAnswer] = useState<ChatAnswer | null>(null);
  // null while Worldbuilder cannot be asked — closed, or no world open.
  const [arten, setArten] = useState<string[] | null>(null);
  const [newLookup, setNewLookup] = useState({ trigger: '', art: '' });

  useEffect(() => {
    apiGet<string[]>('/lookup-commands/arten').then(setArten);
  }, []);

  // Shows how the reply lands in chat while it is being written.
  const response = draft?.response ?? '';
  useEffect(() => {
    if (!response.trim()) { setPreview(null); return; }
    const timer = setTimeout(async () => {
      setPreview(await apiPost<Preview>('/text-commands/preview', { response }));
    }, 250);
    return () => clearTimeout(timer);
  }, [response]);

  const submit = async () => {
    if (!draft) return;
    const body = {
      trigger: draft.trigger,
      response: draft.response,
      cooldown_seconds: draft.cooldown_seconds,
      enabled: draft.enabled,
    };
    const refusal = draft.id === null
      ? await save('POST', '/text-commands', body)
      : await save('PATCH', `/text-commands/${draft.id}`, body);
    if (refusal) { toast.error(refusal); return; }
    setDraft(null);
    refetch();
  };

  const toggle = async (command: TextCommand) => {
    const result = await apiPatch(`/text-commands/${command.id}`, { enabled: !command.enabled });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };

  const remove = async (command: TextCommand) => {
    if (!window.confirm(`${command.trigger} löschen?`)) return;
    const ok = await apiDelete(`/text-commands/${command.id}`);
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    if (draft?.id === command.id) setDraft(null);
    refetch();
  };

  const edit = (c: TextCommand) =>
    setDraft({ id: c.id, trigger: c.trigger, response: c.response, cooldown_seconds: c.cooldown_seconds, enabled: c.enabled });

  const updateLookup = async (lookup: LookupCommand, change: { art?: string; enabled?: boolean }) => {
    const refusal = await save('PATCH', `/lookup-commands/${lookup.id}`, change);
    if (refusal) { toast.error(refusal); return; }
    refetchLookups();
  };

  const addLookup = async () => {
    const refusal = await save('POST', '/lookup-commands', newLookup);
    if (refusal) { toast.error(refusal); return; }
    setNewLookup({ trigger: '', art: '' });
    refetchLookups();
  };

  const removeLookup = async (lookup: LookupCommand) => {
    if (!window.confirm(`${lookup.trigger} löschen?`)) return;
    const ok = await apiDelete(`/lookup-commands/${lookup.id}`);
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    refetchLookups();
  };

  /** The open world's Arten, plus the one a command already points at even if the world lacks it. */
  const artOptions = (current: string) => Array.from(new Set([...(arten ?? []), current]));

  const tryOut = async () => {
    if (!trial.trim()) return;
    setTrialAnswer(await apiPost<ChatAnswer>('/chat/try', { message: trial }));
  };

  const list = commands ?? [];

  return (
    <div className="panel text-commands-panel">
      <div className="clips-panel-header">
        <h2>💬 Erklär-Commands</h2>
      </div>
      <p className="panel-desc">
        Was du sonst in jedem Stream neu erklärst, ruft der Chat hier selbst ab.
      </p>

      <div className="text-commands-section">
        <h3>✍️ Eigene Texte</h3>
        {!draft && (
          <button className="btn-export-small" onClick={() => setDraft({ ...EMPTY_DRAFT })}>+ Neu</button>
        )}
      </div>

      {draft && (
        <div className="text-command-editor">
          <div className="text-command-editor-row">
            <input
              type="text"
              className="text-command-trigger-input"
              placeholder="!story"
              value={draft.trigger}
              onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}
              autoFocus
            />
            <label className="text-command-cooldown" title="So lange antwortet der Befehl nach einer Antwort nicht noch einmal. Mods und du sind ausgenommen.">
              Cooldown
              <input
                type="number"
                min={0}
                max={3600}
                value={draft.cooldown_seconds}
                onChange={(e) => setDraft({ ...draft, cooldown_seconds: Number(e.target.value) })}
              />
              s
            </label>
          </div>

          <textarea
            rows={5}
            placeholder="Was der Chat lesen soll, wenn jemand den Befehl schreibt."
            value={draft.response}
            onChange={(e) => setDraft({ ...draft, response: e.target.value })}
          />

          {preview && (
            <div className={`text-command-preview ${preview.messages.length > preview.max ? 'too-long' : ''}`}>
              <span className="text-command-preview-count">
                {preview.messages.length === 1 ? '1 Chat-Nachricht' : `${preview.messages.length} Chat-Nachrichten`}
                {preview.messages.length > preview.max && ` — höchstens ${preview.max} gehen`}
              </span>
              {preview.messages.length > 1 && preview.messages.map((message, i) => (
                <p key={i} className="text-command-bubble">{message}</p>
              ))}
            </div>
          )}

          <div className="text-command-editor-actions">
            <label className="s-checkbox">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              />{' '}
              Aktiv
            </label>
            <button className="btn-export-small" onClick={() => setDraft(null)}>Abbrechen</button>
            <button className="s-card-action primary" onClick={submit}>Speichern</button>
          </div>
        </div>
      )}

      {loading && !commands ? (
        <p className="empty">Lade…</p>
      ) : list.length === 0 && !draft ? (
        <>
          <EmptyState
            size="compact"
            icon="✍️"
            title="Noch keine eigenen Texte"
            description="Womit fängst du an? Ein Klick legt den Befehl an, den Text schreibst du."
          />
          <div className="text-command-suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.trigger}
                className="btn-export-small"
                title={s.hint}
                onClick={() => setDraft({ ...EMPTY_DRAFT, trigger: s.trigger })}
              >
                {s.trigger}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="text-command-list">
          {list.map((c) => (
            <div
              key={c.id}
              className={`text-command-row ${c.enabled ? '' : 'disabled'} ${draft?.id === c.id ? 'editing' : ''}`}
            >
              <code className="text-command-trigger">{c.trigger}</code>
              <span className="text-command-response" title={c.response}>{c.response}</span>
              <span className="text-command-meta">{c.cooldown_seconds}s</span>
              <div className="issue-actions">
                <button title={c.enabled ? 'Ausschalten' : 'Einschalten'} onClick={() => toggle(c)}>
                  {c.enabled ? '⏸️' : '▶️'}
                </button>
                <button title="Bearbeiten" onClick={() => edit(c)}>✏️</button>
                <button title="Löschen" onClick={() => remove(c)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-commands-section">
        <h3>📖 Aus der Welt nachschlagen</h3>
        <button
          className="btn-export-small"
          title="Arten neu aus dem Worldbuilder laden"
          onClick={() => apiGet<string[]>('/lookup-commands/arten').then(setArten)}
        >
          🔄
        </button>
      </div>
      <p className="panel-desc">
        Zuschauer schlagen selbst nach, z. B. <code>!figur Mila</code>. Jeder Befehl sucht in einer Art deiner Welt.
      </p>
      {arten === null && (
        <p className="empty">
          Worldbuilder ist nicht erreichbar — öffne ihn und schalte unter Verwalten das Schaufenster an.
        </p>
      )}

      <div className="text-command-list">
        {(lookups ?? []).map((l) => (
          <div key={l.id} className={`text-command-row ${l.enabled ? '' : 'disabled'}`}>
            <code className="text-command-trigger">{l.trigger}</code>
            <span className="lookup-arrow">→</span>
            <select value={l.art} onChange={(e) => updateLookup(l, { art: e.target.value })} title="In dieser Art wird gesucht">
              {artOptions(l.art).map((art) => <option key={art} value={art}>{art}</option>)}
            </select>
            {arten && !arten.includes(l.art) && (
              <span className="lookup-missing" title={`Die offene Welt hat keine Art „${l.art}“ — dieser Befehl findet dort nichts.`}>
                ⚠️
              </span>
            )}
            <span className="text-command-meta" title="Cooldown pro Name">{l.cooldown_seconds}s</span>
            <div className="issue-actions">
              <button title={l.enabled ? 'Ausschalten' : 'Einschalten'} onClick={() => updateLookup(l, { enabled: !l.enabled })}>
                {l.enabled ? '⏸️' : '▶️'}
              </button>
              <button title="Löschen" onClick={() => removeLookup(l)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>

      <div className="issue-input lookup-add">
        <input
          type="text"
          placeholder="!fähigkeit"
          value={newLookup.trigger}
          onChange={(e) => setNewLookup({ ...newLookup, trigger: e.target.value })}
        />
        <select value={newLookup.art} onChange={(e) => setNewLookup({ ...newLookup, art: e.target.value })}>
          <option value="">Art wählen…</option>
          {(arten ?? []).map((art) => <option key={art} value={art}>{art}</option>)}
        </select>
        <button onClick={addLookup} disabled={!newLookup.trigger.trim() || !newLookup.art} title="Nachschlage-Command anlegen">+</button>
      </div>

      <div className="text-command-try">
        <div className="issue-input">
          <input
            type="text"
            placeholder="Ausprobieren, z. B. !figur Mila"
            value={trial}
            onChange={(e) => setTrial(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tryOut()}
          />
          <button onClick={tryOut} title="So antwortet der Chat — ohne live zu sein">▶</button>
        </div>
        {trialAnswer && (trialAnswer.replies
          ? trialAnswer.replies.map((reply, i) => <p key={i} className="text-command-bubble">{reply}</p>)
          : <p className="empty">{NO_REPLY[trialAnswer.reason]}</p>)}
      </div>

      <ChatCommands commands={[
        { cmd: '!befehle', desc: 'Listet alle Befehle' },
        ...(lookups ?? []).filter((l) => l.enabled).map((l) => ({
          cmd: `${l.trigger} <Name>`,
          desc: `Sucht unter „${l.art}“`,
        })),
      ]} />
    </div>
  );
}
