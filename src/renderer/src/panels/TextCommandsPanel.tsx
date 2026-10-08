import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiFetch, apiGet, apiPost, useApi } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import EmptyState from '../components/ux/EmptyState';
import Dialog from '../components/ux/Dialog';
import CommandQuestPath from '../components/quests/paths/CommandQuestPath';
import { useQuestPath } from '../components/quests/questStart';
import SearchField, { matchesSearch } from '../components/ux/SearchField';

// "Befehle" under Chat & Bot: one list for everything the streamer maintains —
// own texts (!story) and lookups into the world (!figur) — grouped, with a
// filter for what is on or off. A row shows the sentence viewers read, the
// second names and the star for `!befehle`. Editing happens in a dialog that
// holds name, answer, sentence, second names and pause together; the built-in
// commands are not listed (decided 2026-10-06).

interface TextCommand { id: number; trigger: string; response: string; cooldown_seconds: number; enabled: boolean }
interface LookupCommand { id: number; trigger: string; art: string; cooldown_seconds: number; enabled: boolean }

interface CommandInfo {
  trigger: string;
  description: string;
  group: 'text' | 'lookup' | 'builtin';
  id: string;
  stored: boolean;
  aliases: string[];
}

interface CommandList {
  commands: CommandInfo[];
  panel: string;
  builtinDescriptions: Record<string, string>;
  aliases: Record<string, string>;
  featured: { triggers: string[]; stored: boolean; max: number };
}

interface Preview { messages: string[]; max: number }

type Kind = 'text' | 'lookup';

interface Row {
  kind: Kind;
  id: number;
  trigger: string;
  enabled: boolean;
  cooldown: number;
  sentence: string;
  stored: boolean;
  aliases: string[];
  featured: boolean;
  response: string;
  art: string;
  chars: number;
}

interface Draft {
  kind: Kind;
  id: number | null;
  trigger: string;
  response: string;
  art: string;
  cooldown_seconds: number;
  description: string;
  aliases: string[];
  originalTrigger: string | null;
}

const MAX_CHARS = 500;
const PAUSES = [0, 5, 10, 15, 20, 30, 45, 60, 120, 300];
const SUGGESTIONS = [
  { trigger: '!story', hint: 'Worum geht es in der Geschichte?' },
  { trigger: '!welt', hint: 'Wo spielt das Ganze?' },
  { trigger: '!stream', hint: 'Was passiert hier eigentlich?' },
  { trigger: '!zeitplan', hint: 'Wann wird gestreamt?' },
];

/** A write that hands back the server's own words when it refuses. */
async function write(method: 'POST' | 'PATCH', endpoint: string, body: unknown): Promise<string | null> {
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
  const { data: texts, loading, refetch: refetchTexts } = useApi<TextCommand[]>('/text-commands');
  const { data: lookups, refetch: refetchLookups } = useApi<LookupCommand[]>('/lookup-commands');
  const { data: list, refetch: refetchList } = useApi<CommandList>('/commands');
  const [arten, setArten] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<'on' | 'off'>('on');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [newAlias, setNewAlias] = useState('');
  const [showPanelText, setShowPanelText] = useState(false);

  useEffect(() => { apiGet<string[]>('/lookup-commands/arten').then(setArten); }, []);

  const refetchAll = () => { refetchTexts(); refetchLookups(); refetchList(); };

  // How the answer lands in chat while it is being written.
  const response = draft?.kind === 'text' ? draft.response : '';
  useEffect(() => {
    if (!response.trim()) { setPreview(null); return; }
    const timer = setTimeout(async () => setPreview(await apiPost<Preview>('/text-commands/preview', { response })), 250);
    return () => clearTimeout(timer);
  }, [response]);

  const rows = useMemo<Row[]>(() => {
    const info = new Map<string, CommandInfo>();
    for (const c of list?.commands ?? []) info.set(`${c.group}:${c.id}`, c);
    const featured = new Set(list?.featured.triggers ?? []);
    const textRows: Row[] = (texts ?? []).map((t) => {
      const i = info.get(`text:${t.id}`);
      return { kind: 'text', id: t.id, trigger: t.trigger, enabled: t.enabled, cooldown: t.cooldown_seconds, sentence: i?.description ?? '', stored: i?.stored ?? false, aliases: i?.aliases ?? [], featured: featured.has(t.trigger), response: t.response, art: '', chars: t.response.length };
    });
    const lookupRows: Row[] = (lookups ?? []).map((l) => {
      const i = info.get(`lookup:${l.id}`);
      return { kind: 'lookup', id: l.id, trigger: l.trigger, enabled: l.enabled, cooldown: l.cooldown_seconds, sentence: i?.description ?? '', stored: i?.stored ?? false, aliases: i?.aliases ?? [], featured: featured.has(l.trigger), response: '', art: l.art, chars: 0 };
    });
    return [...textRows, ...lookupRows];
  }, [texts, lookups, list]);

  const onCount = rows.filter((r) => r.enabled).length;
  const offCount = rows.length - onCount;
  // A search looks through everything, on and off; the filter applies without one.
  const searching = search.trim() !== '';
  const shown = rows.filter((r) => (searching
    ? matchesSearch(search, r.trigger, r.sentence, r.response, r.art, ...r.aliases)
    : (filter === 'on' ? r.enabled : !r.enabled)));
  const groups: Array<{ kind: Kind; title: string; rows: Row[] }> = [
    { kind: 'text', title: 'Eigene Texte', rows: shown.filter((r) => r.kind === 'text') },
    { kind: 'lookup', title: 'Aus der Welt nachschlagen', rows: shown.filter((r) => r.kind === 'lookup') },
  ];

  // New commands are made on a Quest-Pfad; the dialog below stays for editing.
  const [path, setPath] = useState<{ trigger?: string } | null>(null);
  useQuestPath(['command'], () => setPath({}));
  const openEdit = (row: Row) =>
    setDraft({ kind: row.kind, id: row.id, trigger: row.trigger, response: row.response, art: row.art, cooldown_seconds: row.cooldown, description: row.stored ? row.sentence : '', aliases: row.aliases, originalTrigger: row.trigger });
  const close = () => { setDraft(null); setNewAlias(''); };

  const toggleEnabled = async (row: Row) => {
    const refusal = await write('PATCH', `/${row.kind === 'text' ? 'text-commands' : 'lookup-commands'}/${row.id}`, { enabled: !row.enabled });
    if (refusal) { toast.error(refusal); return; }
    refetchAll();
  };

  const toggleFeatured = async (row: Row) => {
    if (!list) return;
    const current = list.featured.triggers;
    const triggers = current.includes(row.trigger) ? current.filter((t) => t !== row.trigger) : [...current, row.trigger];
    if (triggers.length > list.featured.max) { toast.error(`Höchstens ${list.featured.max} vorn – mehr liest im Chat niemand.`); return; }
    const refusal = await write('POST', '/commands/featured', { triggers });
    if (refusal) { toast.error(refusal); return; }
    refetchList();
  };

  /** Saves the second names: the whole map goes back, with this command's entries replaced. */
  const saveAliases = async (trigger: string, aliases: string[], previousTrigger: string | null) => {
    const current = list?.aliases ?? {};
    const next: Record<string, string> = {};
    for (const [alias, target] of Object.entries(current)) {
      if (target === trigger || (previousTrigger && target === previousTrigger)) continue;
      next[alias] = target;
    }
    for (const alias of aliases) next[alias] = trigger;
    const same = JSON.stringify(Object.entries(next).sort()) === JSON.stringify(Object.entries(current).sort());
    if (same) return null;
    return write('POST', '/commands/aliases', next);
  };

  const save = async () => {
    if (!draft) return;
    const endpoint = draft.kind === 'text' ? '/text-commands' : '/lookup-commands';
    const body = draft.kind === 'text'
      ? { trigger: draft.trigger, response: draft.response, cooldown_seconds: draft.cooldown_seconds, description: draft.description }
      : { trigger: draft.trigger, art: draft.art, cooldown_seconds: draft.cooldown_seconds, description: draft.description };
    let refusal: string | null;
    let savedTrigger = draft.trigger.trim();
    if (draft.id === null) {
      try {
        const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
        if (!res.ok) { const data = await res.json().catch(() => ({})); toast.error(data.message || 'Speichern fehlgeschlagen'); return; }
        savedTrigger = ((await res.json()) as { trigger: string }).trigger;
        refusal = null;
      } catch { toast.error('Server nicht erreichbar'); return; }
    } else {
      refusal = await write('PATCH', `${endpoint}/${draft.id}`, body);
      if (refusal) { toast.error(refusal); return; }
      savedTrigger = savedTrigger.startsWith('!') ? savedTrigger.toLowerCase() : `!${savedTrigger.toLowerCase()}`;
    }
    const aliasRefusal = await saveAliases(savedTrigger, draft.aliases, draft.originalTrigger);
    if (aliasRefusal) toast.error(`Gespeichert, aber die Zweitnamen nicht: ${aliasRefusal}`);
    close();
    refetchAll();
  };

  const remove = async () => {
    if (!draft || draft.id === null) return;
    if (!window.confirm(`${draft.trigger} löschen?`)) return;
    const ok = await apiDelete(`/${draft.kind === 'text' ? 'text-commands' : 'lookup-commands'}/${draft.id}`);
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    if (draft.aliases.length) await saveAliases(draft.trigger, [], draft.originalTrigger);
    close();
    refetchAll();
  };

  const addAlias = () => {
    if (!draft) return;
    let alias = newAlias.trim().toLowerCase();
    if (!alias) return;
    if (!alias.startsWith('!')) alias = `!${alias}`;
    if (draft.aliases.includes(alias)) { setNewAlias(''); return; }
    setDraft({ ...draft, aliases: [...draft.aliases, alias] });
    setNewAlias('');
  };

  const copyPanel = async () => {
    if (!list) return;
    try {
      await navigator.clipboard.writeText(list.panel);
      toast.success('Kopiert – in Twitch unter „Kanal bearbeiten → Panels“ einfügen');
    } catch { toast.error('Kopieren fehlgeschlagen'); }
  };

  const artOptions = (current: string) => Array.from(new Set([...(arten ?? []), ...(current ? [current] : [])]));
  const derivedSentence = (d: Draft) => (list?.commands ?? []).find((c) => c.group === d.kind && c.id === String(d.id))?.description;
  const pauses = (current: number) => Array.from(new Set([...PAUSES, current])).sort((a, b) => a - b);

  if (loading && !texts) return <div className="panel"><p className="empty">Laden …</p></div>;

  return (
    <div className="panel cmd-panel">
      <div className="cmd-toolbar">
        <div className="filter-pills" role="group" aria-label="Filter">
          <button type="button" className={`pill ${filter === 'on' ? 'active' : ''}`} aria-pressed={filter === 'on'} onClick={() => setFilter('on')}>Aktiv · {onCount}</button>
          <button type="button" className={`pill ${filter === 'off' ? 'active' : ''}`} aria-pressed={filter === 'off'} onClick={() => setFilter('off')}>Ausgeschaltet · {offCount}</button>
        </div>
        <div className="card-row card-wrap">
          {rows.length > 0 && <SearchField value={search} onChange={setSearch} label="Befehle suchen" />}
          <button type="button" className="card-primary" onClick={() => setPath({})}>+ Neuer Befehl</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <>
          <EmptyState size="compact" icon="✍️" title="Noch keine eigenen Befehle" description="Womit fängst du an? Ein Klick legt den Befehl an, den Text schreibst du." />
          <div className="card-row card-wrap">
            {SUGGESTIONS.map((s) => (
              <button key={s.trigger} type="button" className="card-secondary" title={s.hint} onClick={() => setPath({ trigger: s.trigger })}>{s.trigger}</button>
            ))}
          </div>
        </>
      ) : shown.length === 0 ? (
        <p className="dialog-empty">{searching ? `Kein Befehl passt zu „${search.trim()}“.` : filter === 'off' ? 'Hier ist nichts ausgeschaltet.' : 'Alles ist ausgeschaltet.'}</p>
      ) : (
        groups.filter((g) => g.rows.length > 0).map((g) => (
          <section key={g.kind} className="cmd-group" aria-label={g.title}>
            <h3 className="dialog-section">{g.title}</h3>
            {g.kind === 'lookup' && arten === null && (
              <p className="dialog-hint">Der Worldbuilder ist nicht erreichbar – diese Befehle finden gerade nichts.</p>
            )}
            <ul className="cmd-list">
              {g.rows.map((row) => (
                <li key={`${row.kind}:${row.id}`} className={`cmd-row ${row.enabled ? '' : 'off'}`}>
                  <button
                    type="button"
                    className={`cmd-star ${row.featured ? 'on' : ''}`}
                    title={row.featured ? 'Steht in „!befehle“ vorn – abwählen' : 'In „!befehle“ vorn nennen'}
                    aria-label={row.featured ? `${row.trigger} steht vorn` : `${row.trigger} vorn nennen`}
                    aria-pressed={row.featured}
                    onClick={() => toggleFeatured(row)}
                  >★</button>
                  <code className="cmd-trigger">{row.trigger}</code>
                  <span className="cmd-text">
                    <span className={row.stored ? '' : 'cmd-derived'}>{row.sentence || '–'}</span>
                    {row.aliases.length > 0 && <span className="cmd-aliases"> · auch {row.aliases.join(', ')}</span>}
                  </span>
                  <span className="cmd-meta">
                    {row.kind === 'text'
                      ? `${row.chars} von ${MAX_CHARS} Zeichen`
                      : arten && !arten.includes(row.art) ? `Art „${row.art}“ fehlt in der offenen Welt` : `sucht unter „${row.art}“`}
                  </span>
                  <button type="button" className="card-secondary" onClick={() => openEdit(row)}>Bearbeiten</button>
                  <button type="button" className="card-link" onClick={() => toggleEnabled(row)}>{row.enabled ? 'Ausschalten' : 'Einschalten'}</button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <div className="cmd-footer">
        <span className="dialog-hint">Der Stern heißt: Dieser Befehl steht vorn, wenn jemand „!befehle“ schreibt – höchstens {list?.featured.max ?? 5}. Der Satz daneben steht in „!befehle“ und im Twitch-Panel; ohne eigenen Satz schreibt das Tool einen.</span>
        <div className="card-row card-wrap">
          <button type="button" className="card-secondary" onClick={copyPanel} disabled={!list}>Text fürs Twitch-Panel kopieren</button>
          <button type="button" className="card-link" onClick={() => setShowPanelText(true)} disabled={!list}>Ansehen</button>
        </div>
      </div>

      {showPanelText && list && (
        <Dialog title="Text fürs Twitch-Panel" sentence="Nach Änderungen von Hand in Twitch unter „Kanal bearbeiten → Panels“ einfügen." onClose={() => setShowPanelText(false)}
          footer={<><button type="button" className="card-secondary" onClick={copyPanel}>Kopieren</button><button type="button" className="card-primary" onClick={() => setShowPanelText(false)}>Fertig</button></>}>
          <pre className="cmd-panel-text">{list.panel}</pre>
        </Dialog>
      )}

      {path && <CommandQuestPath initialTrigger={path.trigger} taken={[...rows.map((r) => r.trigger), ...Object.keys(list?.aliases ?? {})]} onClose={() => setPath(null)} onCreated={refetchAll} />}
      {draft && (
        <Dialog
          title={draft.id === null ? 'Neuer Befehl' : `${draft.originalTrigger} bearbeiten`}
          sentence={draft.kind === 'text' ? 'Ein Befehl, der einen festen Text antwortet.' : 'Ein Befehl, der in einer Art deiner Welt nachschlägt, z. B. !figur Mila.'}
          onClose={close}
          footer={<>
            {draft.id !== null && <button type="button" className="card-link" onClick={remove}>Löschen</button>}
            <span style={{ flex: 1 }} />
            <button type="button" className="card-secondary" onClick={close}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={save} disabled={!draft.trigger.trim() || (draft.kind === 'text' ? !draft.response.trim() : !draft.art)}>Speichern</button>
          </>}
        >
          {draft.id === null && (
            <div className="card-row">
              <button type="button" className={`card-secondary ${draft.kind === 'text' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, kind: 'text' })}>Eigener Text</button>
              <button type="button" className={`card-secondary ${draft.kind === 'lookup' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, kind: 'lookup', art: draft.art || arten?.[0] || '' })}>Aus der Welt nachschlagen</button>
            </div>
          )}
          <div className="dialog-grid">
            <div className="dialog-field">
              <label htmlFor="cmd-name">Name – das tippt der Chat</label>
              <input id="cmd-name" type="text" placeholder="!story" value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value })} autoFocus={draft.id === null} />
            </div>
            <div className="dialog-field">
              <label htmlFor="cmd-pause">Pause – so lange antwortet er in einem ruhigen Chat nicht noch einmal</label>
              <select id="cmd-pause" className="card-select" value={draft.cooldown_seconds} onChange={(e) => setDraft({ ...draft, cooldown_seconds: Number(e.target.value) })}>
                {pauses(draft.cooldown_seconds).map((s) => <option key={s} value={s}>{s === 0 ? 'Keine' : `${s} Sekunden`}</option>)}
              </select>
            </div>
          </div>

          {draft.kind === 'text' ? (
            <div className="dialog-field">
              <label htmlFor="cmd-text">Antwort – das schreibt der Bot (höchstens {MAX_CHARS} Zeichen je Nachricht, sonst werden es mehrere)</label>
              <textarea id="cmd-text" rows={5} placeholder="Was der Chat lesen soll, wenn jemand den Befehl schreibt." value={draft.response} onChange={(e) => setDraft({ ...draft, response: e.target.value })} />
              {preview && (
                <span className={`dialog-hint ${preview.messages.length > preview.max ? 'cmd-too-long' : ''}`}>
                  {draft.response.length} Zeichen · {preview.messages.length === 1 ? '1 Chat-Nachricht' : `${preview.messages.length} Chat-Nachrichten`}
                  {preview.messages.length > preview.max && ` – höchstens ${preview.max} gehen`}
                </span>
              )}
            </div>
          ) : (
            <div className="dialog-field">
              <label htmlFor="cmd-art">Art der Welt, in der gesucht wird</label>
              <select id="cmd-art" className="card-select" value={draft.art} onChange={(e) => setDraft({ ...draft, art: e.target.value })}>
                {artOptions(draft.art).length === 0 && <option value="">Keine Art bekannt</option>}
                {artOptions(draft.art).map((art) => <option key={art} value={art}>{art}</option>)}
              </select>
              {arten === null && <span className="dialog-hint">Der Worldbuilder ist nicht erreichbar – die Arten kommen, sobald er läuft und das Schaufenster offen ist.</span>}
            </div>
          )}

          <div className="dialog-field">
            <label htmlFor="cmd-sentence">Ein Satz für Zuschauer – steht in „!befehle“ und im Twitch-Panel</label>
            <input id="cmd-sentence" type="text" maxLength={300} placeholder={derivedSentence(draft) ?? 'Leer lassen, dann schreibt das Tool einen.'} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>

          <div className="dialog-field">
            <span className="dialog-field-label">Zweitnamen – antworten genauso</span>
            <div className="chip-list">
              {draft.aliases.map((alias) => (
                <span key={alias} className="chip">
                  <code>{alias}</code>
                  <button type="button" className="card-link" onClick={() => setDraft({ ...draft, aliases: draft.aliases.filter((a) => a !== alias) })}>Entfernen</button>
                </span>
              ))}
              {draft.aliases.length === 0 && <span className="dialog-hint">Noch keiner – z. B. !socials für !links.</span>}
            </div>
            <div className="card-row">
              <input type="text" placeholder="!zweitname" aria-label="Neuer Zweitname" value={newAlias} onChange={(e) => setNewAlias(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }} />
              <button type="button" className="card-secondary" onClick={addAlias} disabled={!newAlias.trim()}>Hinzufügen</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
