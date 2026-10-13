import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiFetch, apiGet, apiPost, useApi } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import EmptyState from '../components/ux/EmptyState';
import Dialog from '../components/ux/Dialog';
import CommandQuestPath from '../components/quests/paths/CommandQuestPath';
import { useQuestPath } from '../components/quests/questStart';
import { useFeatures } from '../contexts/FeaturesContext';
import { commandVisible } from '../../../shared/features';

// "Befehle" under Chat & Bot: one list for every command — own texts
// (!zeitplan), lookups into the world (!figur) and, since 13.10., the built-in
// ones (!projekt), which can only be renamed here. Filters: all, own, built-in,
// and what is switched off. A row shows the sentence viewers read, the second
// names and the star for `!befehle`. Editing happens in a dialog that holds
// name, answer, sentence, second names and pause together.

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

interface Builtin { key: string; label: string; description: string; modsOnly: boolean }

type Filter = 'all' | 'own' | 'builtin' | 'off';

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
  enabled: boolean;
  featured: boolean;
}

const MAX_CHARS = 500;
const PAUSES = [0, 5, 10, 15, 20, 30, 45, 60, 120, 300];
const SUGGESTIONS = [
  { trigger: '!stream', hint: 'Was passiert hier eigentlich?' },
  { trigger: '!zeitplan', hint: 'Wann wird gestreamt?' },
  { trigger: '!setup', hint: 'Womit arbeitest du?' },
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
  const { worldbuilder, features } = useFeatures();
  const { data: texts, loading, refetch: refetchTexts } = useApi<TextCommand[]>('/text-commands');
  const { data: lookups, refetch: refetchLookups } = useApi<LookupCommand[]>('/lookup-commands');
  const { data: list, refetch: refetchList } = useApi<CommandList>('/commands');
  const [arten, setArten] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [newAlias, setNewAlias] = useState('');
  const [showPanelText, setShowPanelText] = useState(false);

  useEffect(() => { apiGet<string[]>('/lookup-commands/arten').then(setArten); }, []);

  // The built-in commands: their names, and what each is called in the app.
  const { data: names, refetch: refetchNames } = useApi<Record<string, string>>('/settings/commands');
  const { data: builtinInfo } = useApi<Builtin[]>('/commands/builtins');
  const [renaming, setRenaming] = useState<{ key: string; label: string; name: string } | null>(null);

  const refetchAll = () => { refetchTexts(); refetchLookups(); refetchList(); refetchNames(); };

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
    return [...textRows, ...(worldbuilder ? lookupRows : [])];
  }, [texts, lookups, list, worldbuilder]);

  // Built-ins of features that are off say nothing in chat, so they are not listed.
  const builtins = Object.entries(names ?? {})
    .filter(([key]) => commandVisible(features, key))
    .map(([key, name]) => {
      const info = builtinInfo?.find((b) => b.key === key);
      return { key, name, label: info?.label ?? key, description: info?.description ?? '', modsOnly: info?.modsOnly ?? false };
    });

  const onCount = rows.filter((r) => r.enabled).length;
  const offCount = rows.length - onCount;
  // Nothing left switched off: the filter for it goes, and with it the view.
  const view: Filter = filter === 'off' && offCount === 0 ? 'all' : filter;
  const shown = rows.filter((r) => (view === 'builtin' ? false : view === 'off' ? !r.enabled : r.enabled));
  const shownBuiltins = view === 'all' || view === 'builtin' ? builtins : [];
  const showOwn = view !== 'builtin';
  const filters: Array<[Filter, string]> = [
    ['all', `Alle · ${onCount + builtins.length}`],
    ['own', `Eigene · ${onCount}`],
    ['builtin', `Eingebaut · ${builtins.length}`],
    ...(offCount > 0 ? [['off', `Ausgeschaltet · ${offCount}`] as [Filter, string]] : []),
  ];

  const saveName = async () => {
    if (!renaming || !names) return;
    const refusal = await write('POST', '/settings/commands', { ...names, [renaming.key]: renaming.name });
    if (refusal) { toast.error(refusal); return; }
    toast.success('Name gespeichert');
    setRenaming(null);
    refetchAll();
  };

  // New commands are made on a Quest-Pfad; the dialog below stays for editing.
  const [path, setPath] = useState<{ trigger?: string } | null>(null);
  useQuestPath(['command'], () => setPath({}));
  const openEdit = (row: Row) =>
    setDraft({ kind: row.kind, id: row.id, trigger: row.trigger, response: row.response, art: row.art, cooldown_seconds: row.cooldown, description: row.stored ? row.sentence : '', aliases: row.aliases, originalTrigger: row.trigger, enabled: row.enabled, featured: row.featured });
  const close = () => { setDraft(null); setNewAlias(''); };

  /** Names the command in "!befehle" first, or no longer; null when nothing changed or it worked. */
  const saveFeatured = async (trigger: string, previousTrigger: string | null, featured: boolean) => {
    if (!list) return null;
    const current = list.featured.triggers;
    const others = current.filter((t) => t !== trigger && t !== previousTrigger);
    const triggers = featured ? [...others, trigger] : others;
    if (JSON.stringify(triggers) === JSON.stringify(current)) return null;
    if (triggers.length > list.featured.max) return `Höchstens ${list.featured.max} vorn – mehr liest im Chat niemand.`;
    return write('POST', '/commands/featured', { triggers });
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
      ? { trigger: draft.trigger, response: draft.response, cooldown_seconds: draft.cooldown_seconds, description: draft.description, enabled: draft.enabled }
      : { trigger: draft.trigger, art: draft.art, cooldown_seconds: draft.cooldown_seconds, description: draft.description, enabled: draft.enabled };
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
    const featuredRefusal = await saveFeatured(savedTrigger, draft.originalTrigger, draft.featured);
    if (featuredRefusal) toast.error(`Gespeichert, aber nicht vorn in „!befehle“: ${featuredRefusal}`);
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
          {filters.map(([key, label]) => (
            <button key={key} type="button" className={`pill ${view === key ? 'active' : ''}`} aria-pressed={view === key} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <button type="button" className="card-primary" onClick={() => setPath({})}>+ Neuer Befehl</button>
      </div>

      {showOwn && rows.length === 0 && (
        <>
          <EmptyState size="compact" icon="✍️" title="Noch keine eigenen Befehle" description="Womit fängst du an? Ein Klick legt den Befehl an, den Text schreibst du." />
          <div className="card-row card-wrap">
            {SUGGESTIONS.map((s) => (
              <button key={s.trigger} type="button" className="card-secondary" title={s.hint} onClick={() => setPath({ trigger: s.trigger })}>{s.trigger}</button>
            ))}
          </div>
        </>
      )}
      {showOwn && rows.length > 0 && shown.length === 0 && view !== 'off' && <p className="dialog-empty">Alle eigenen Befehle sind ausgeschaltet.</p>}
      {shown.some((r) => r.kind === 'lookup') && arten === null && (
        <p className="dialog-hint">Der Worldbuilder ist nicht erreichbar – die Befehle „aus der Welt“ finden gerade nichts.</p>
      )}

      {(shown.length > 0 || shownBuiltins.length > 0) && (
        <ul className="chat-list" aria-label="Befehle">
          {shown.map((row) => (
            <li key={`${row.kind}:${row.id}`} className={`chat-row ${row.enabled ? '' : 'off'}`}>
              <code>{row.trigger}</code>
              <span className="chat-row-text">{row.sentence || '–'}</span>
              <span className="chat-row-kind">{row.kind === 'text' ? 'eigener' : 'aus der Welt'}{row.enabled ? '' : ' · aus'}</span>
              <button type="button" className="card-secondary" onClick={() => openEdit(row)}>Bearbeiten</button>
            </li>
          ))}
          {shownBuiltins.map((b) => (
            <li key={b.key} className="chat-row">
              <code>{b.name}</code>
              <span className="chat-row-text">{b.description || b.label}</span>
              <span className="chat-row-kind">{b.modsOnly ? 'eingebaut · nur Mods' : 'eingebaut'}</span>
              <button type="button" className="card-secondary" onClick={() => setRenaming({ key: b.key, label: b.label, name: b.name })}>Bearbeiten</button>
            </li>
          ))}
        </ul>
      )}

      <div className="card-row">
        <button type="button" className="card-link" onClick={() => setShowPanelText(true)} disabled={!list}>Text fürs Twitch-Panel</button>
      </div>

      {showPanelText && list && (
        <Dialog title="Text fürs Twitch-Panel" sentence="Nach Änderungen von Hand in Twitch unter „Kanal bearbeiten → Panels“ einfügen." onClose={() => setShowPanelText(false)}
          footer={<><button type="button" className="card-secondary" onClick={copyPanel}>Kopieren</button><button type="button" className="card-primary" onClick={() => setShowPanelText(false)}>Fertig</button></>}>
          <pre className="cmd-panel-text">{list.panel}</pre>
        </Dialog>
      )}

      {renaming && (
        <Dialog
          title={`${renaming.label} bearbeiten`}
          sentence="Der Befehl tut dasselbe, der Chat tippt nur einen anderen Namen."
          onClose={() => setRenaming(null)}
          width={480}
          footer={<>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-secondary" onClick={() => setRenaming(null)}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={saveName} disabled={!renaming.name.trim()}>Speichern</button>
          </>}
        >
          <div className="dialog-field">
            <label htmlFor="builtin-name">Name – das tippt der Chat</label>
            <input id="builtin-name" type="text" maxLength={40} value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && renaming.name.trim() && saveName()} autoFocus />
          </div>
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
          {draft.id === null && worldbuilder && (
            <div className="card-row">
              <button type="button" className={`card-secondary ${draft.kind === 'text' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, kind: 'text' })}>Eigener Text</button>
              <button type="button" className={`card-secondary ${draft.kind === 'lookup' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, kind: 'lookup', art: draft.art || arten?.[0] || '' })}>Aus der Welt nachschlagen</button>
            </div>
          )}
          <div className="dialog-grid">
            <div className="dialog-field">
              <label htmlFor="cmd-name">Name – das tippt der Chat</label>
              <input id="cmd-name" type="text" placeholder="!zeitplan" value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value })} autoFocus={draft.id === null} />
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

          {draft.id !== null && (
            <label className="card-check">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              <span>An – der Bot antwortet darauf</span>
            </label>
          )}
          <label className="card-check">
            <input type="checkbox" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} />
            <span>In „!befehle“ vorn nennen – höchstens {list?.featured.max ?? 5} Befehle</span>
          </label>

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
