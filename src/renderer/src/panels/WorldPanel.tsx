import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiDelete, apiFetch, apiGet, apiPost } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import EmptyState from '../components/ux/EmptyState';
import ChatCommands from '../components/ChatCommands';

interface EntryField {
  name: string;
  value: string;
}

interface Entry {
  id: string;
  source: 'notion' | 'worldbuilder';
  title: string;
  art: string;
  artColor: string | null;
  maturity: string | null;
  aliases: string[];
  text: string | null;
  fields: EntryField[];
  image: string | null;
  world: string | null;
  hidden: string[];
}

interface Art {
  name: string;
  color: string | null;
}

interface SourceInfo {
  source: 'notion' | 'worldbuilder';
  kind?: string;
  world?: string | null;
}

interface LoadError {
  error: string;
  message?: string;
}

/** The parts of an entry that are not fields but can be kept off stream all the same. */
const TEXT = '@text';
const ALIASES = '@aliases';
const IMAGE = '@image';

function hint(failure: LoadError): string {
  switch (failure.error) {
    case 'worldbuilder_not_running': return 'Worldbuilder läuft nicht — öffne ihn und schalte unter Verwalten das Schaufenster an.';
    case 'worldbuilder_no_world': return 'Im Worldbuilder ist keine Welt offen.';
    case 'worldbuilder_timeout': return 'Worldbuilder antwortet nicht.';
    case 'no_database': return 'Keine Figuren-Datenbank in Notion konfiguriert.';
    case 'no_token': return 'Kein Notion-Token hinterlegt — trag ihn in den Settings ein.';
    case 'notion_error': return 'Notion antwortet, kennt die Datenbank aber nicht. Teile die Seite mit deiner Integration.';
    default: return failure.message || 'Die Quelle ist gerade nicht erreichbar.';
  }
}

function initials(title: string): string {
  const words = title
    .replace(/„[^“]*“/g, ' ')
    .replace(/\b(Die|Der|Das|und)\b|Dr\./g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0]).toUpperCase();
}

/** One line under the name in the list. */
function subline(entry: Entry): string | null {
  const field = (name: string) => entry.fields.find((f) => f.name === name)?.value;
  return field('Rolle') ?? field('Kurzbeschreibung') ?? entry.text ?? null;
}

/** Everything of an entry that could end up on stream, each with its own switch. */
function switchableParts(entry: Entry): Array<{ key: string; label: string; value: string }> {
  return [
    ...(entry.aliases.length > 0 ? [{ key: ALIASES, label: 'Zweitnamen', value: entry.aliases.join(', ') }] : []),
    ...entry.fields.filter((f) => f.value.trim()).map((f) => ({ key: f.name, label: f.name, value: f.value })),
    ...(entry.text ? [{ key: TEXT, label: 'Text', value: entry.text }] : []),
    ...(entry.image ? [{ key: IMAGE, label: 'Bild', value: 'Porträt' }] : []),
  ];
}

export default function WorldPanel() {
  const { toast } = useToast();
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [arten, setArten] = useState<Art[]>([]);
  const [art, setArt] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [active, setActive] = useState<Entry | null>(null);

  const loadActive = useCallback(async () => {
    const data = await apiGet<{ entry: Entry | null }>('/entries/active');
    setActive(data?.entry ?? null);
  }, []);

  const loadWorld = useCallback(async () => {
    setLoading(true);
    const info = await apiGet<SourceInfo>('/characters/source');
    setSource(info);

    const res = await apiFetch('/entries/arten');
    if (!res.ok) {
      setArten([]);
      setEntries([]);
      setLoadError((await res.json().catch(() => ({ error: 'unknown' }))) as LoadError);
      setLoading(false);
      return;
    }

    const list = (await res.json()) as Art[];
    setArten(list);
    setLoadError(null);
    // Stay on the Art in view if the world still has it; otherwise start at the characters.
    setArt((current) =>
      current && list.some((a) => a.name === current)
        ? current
        : (list.find((a) => a.name === info?.kind)?.name ?? list[0]?.name ?? null));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWorld();
    loadActive();
  }, [loadWorld, loadActive]);

  useEffect(() => {
    if (!art) return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch(`/entries?art=${encodeURIComponent(art)}`);
      if (cancelled) return;
      if (!res.ok) {
        setEntries([]);
        setLoadError((await res.json().catch(() => ({ error: 'unknown' }))) as LoadError);
        return;
      }
      setEntries((await res.json()) as Entry[]);
    })();
    return () => { cancelled = true; };
  }, [art, reloadKey]);

  useWebSocket((event) => {
    if (event === 'entry-changed') loadActive();
  });

  const refresh = () => {
    loadWorld();
    loadActive();
    setReloadKey((key) => key + 1);
  };

  const switchSource = async (next: SourceInfo['source']) => {
    if (source?.source === next) return;
    const result = await apiPost('/characters/source', { source: next });
    if (!result) { toast.error('Quelle konnte nicht umgestellt werden'); return; }
    setArt(null);
    setEntries([]);
    setSelectedId(null);
    refresh();
  };

  const pin = async (entry: Entry) => {
    const result = await apiPost<{ entry: Entry }>('/entries/active', { ...entry, hidden: undefined });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setActive(result.entry);
  };

  const unpin = async () => {
    const ok = await apiDelete('/entries/active');
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    setActive(null);
  };

  const toggle = async (entry: Entry, key: string) => {
    const hidden = entry.hidden.includes(key) ? entry.hidden.filter((k) => k !== key) : [...entry.hidden, key];
    const res = await apiFetch(`/entries/${encodeURIComponent(entry.id)}/hidden`, {
      method: 'POST',
      body: JSON.stringify({ fields: hidden }),
    });
    if (!res.ok) { toast.error('Aktion fehlgeschlagen'); return; }
    const saved = ((await res.json()) as { hidden: string[] }).hidden;
    setEntries((list) => list.map((e) => (e.id === entry.id ? { ...e, hidden: saved } : e)));
    setActive((current) => (current?.id === entry.id ? { ...current, hidden: saved } : current));
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => [e.title, ...e.aliases].some((name) => name.toLowerCase().includes(q)));
  }, [entries, query]);

  const selected = entries.find((e) => e.id === selectedId) ?? (active?.id === selectedId ? active : null);

  return (
    <div className="panel world-panel">
      <div className="clips-panel-header">
        <h2>🌍 Welt</h2>
        {active && (
          <button className="btn-export-small" onClick={unpin} title="Aus dem Overlay nehmen">✕ Overlay leeren</button>
        )}
        <button className="btn-export-small" onClick={refresh} title="Neu laden">🔄</button>
      </div>

      <div className="world-source">
        <span>Quelle</span>
        {(['worldbuilder', 'notion'] as const).map((s) => (
          <button
            key={s}
            className={`world-source-btn ${source?.source === s ? 'active' : ''}`}
            onClick={() => switchSource(s)}
          >
            {s === 'worldbuilder' ? 'Worldbuilder' : 'Notion'}
          </button>
        ))}
        {source?.source === 'worldbuilder' && source.world && (
          <span className="world-source-name">„{source.world}“</span>
        )}
      </div>

      {active && (
        <button className="character-active" onClick={() => setSelectedId(active.id)} title="Schalter für diesen Eintrag zeigen">
          <span className="character-active-label">Im Overlay</span>
          <strong>{active.title}</strong>
          <span className="character-active-role">{active.art}</span>
          {active.hidden.length > 0 && <span title="Felder ausgeblendet">🙈 {active.hidden.length}</span>}
        </button>
      )}

      {loading ? (
        <p className="empty">Lade…</p>
      ) : loadError ? (
        <EmptyState icon="🔌" title="Welt nicht abrufbar" description={hint(loadError)} />
      ) : (
        <>
          <div className="world-arten">
            {arten.map((a) => (
              <button
                key={a.name}
                className={`world-art ${a.name === art ? 'active' : ''}`}
                onClick={() => { setArt(a.name); setSelectedId(null); setQuery(''); }}
              >
                <i style={{ background: a.color ?? 'var(--muted)' }} />
                {a.name}
              </button>
            ))}
          </div>

          <input
            type="text"
            className="world-search"
            placeholder="Suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {visible.length === 0 ? (
            <EmptyState
              size="compact"
              icon="📖"
              title={query ? 'Nichts gefunden' : `Noch nichts unter „${art ?? ''}“`}
              description={query ? 'Anderer Name, oder ein anderer Reiter?' : 'Leg einen Eintrag dieser Art an, dann erscheint er hier.'}
            />
          ) : (
            <div className="character-list">
              {visible.map((e) => (
                <div
                  key={e.id}
                  role="button"
                  className={`character-row ${active?.id === e.id ? 'active' : ''} ${selectedId === e.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(selectedId === e.id ? null : e.id)}
                  title="Schalter für diesen Eintrag zeigen"
                >
                  {/* A Worldbuilder portrait sits behind a token the panel does not have. */}
                  {e.image && e.source === 'notion'
                    ? <img className="character-row-portrait" src={e.image} alt="" />
                    : <span className="character-row-portrait placeholder" style={{ color: e.artColor ?? undefined }}>{initials(e.title)}</span>}
                  <span className="character-row-body">
                    <span className="character-row-name">{e.title}</span>
                    {subline(e) && <span className="character-row-summary">{subline(e)}</span>}
                  </span>
                  {e.hidden.length > 0 && <span className="world-row-hidden" title="Felder ausgeblendet">🙈</span>}
                  {e.maturity && <span className="character-row-role">{e.maturity}</span>}
                  <button
                    className="btn-export-small"
                    title="Ins Overlay"
                    onClick={(ev) => { ev.stopPropagation(); pin(e); }}
                  >
                    ▶
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <div className="entry-detail">
          <div className="entry-detail-head">
            <strong>{selected.title}</strong>
            <span className="character-row-role">{selected.art}</span>
            {active?.id === selected.id
              ? <span className="entry-detail-live">● Im Overlay</span>
              : <button className="s-card-action primary" onClick={() => pin(selected)}>Ins Overlay</button>}
          </div>
          <p className="panel-desc">
            👁 heißt: im Stream zu sehen. Was du ausblendest, erscheint weder auf der Karte noch in Chat-Antworten.
          </p>
          {switchableParts(selected).length === 0 && <p className="empty">Dieser Eintrag hat noch nichts, was sich zeigen ließe.</p>}
          {switchableParts(selected).map((part) => {
            const hidden = selected.hidden.includes(part.key);
            return (
              <div key={part.key} className={`entry-field ${hidden ? 'is-hidden' : ''}`}>
                <button
                  className="entry-field-eye"
                  title={hidden ? 'Im Stream zeigen' : 'Im Stream ausblenden'}
                  onClick={() => toggle(selected, part.key)}
                >
                  {hidden ? '🙈' : '👁'}
                </button>
                <span className="entry-field-label">{part.label}</span>
                <span className="entry-field-value">{part.value}</span>
              </div>
            );
          })}
        </div>
      )}

      <ChatCommands commands={[
        { cmd: '!figur', desc: 'Zeigt die Figur, an der gerade gearbeitet wird' },
        { cmd: '!figur <Name>', desc: 'Schlägt eine Figur in der Welt nach' },
      ]} />
    </div>
  );
}
