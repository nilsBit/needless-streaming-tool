import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete, apiFetch } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import EmptyState from '../components/ux/EmptyState';
import ChatCommands from '../components/ChatCommands';

interface Character {
  id: string;
  name: string;
  role: string | null;
  status: string | null;
  summary: string | null;
  image: string | null;
}

interface LoadError {
  error: string;
  message?: string;
}

const ROLE_EMOJI: Record<string, string> = {
  Protagonistin: '🌟',
  Antagonist: '⚔️',
  Verbündete: '🤝',
  Gegenspieler: '🎭',
  Nebenfigur: '👤',
};

export default function CharactersPanel() {
  const { toast } = useToast();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [active, setActive] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch('/characters');
    if (res.ok) {
      setCharacters((await res.json()) as Character[]);
      setLoadError(null);
    } else {
      setCharacters([]);
      setLoadError((await res.json().catch(() => ({ error: 'unknown' }))) as LoadError);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    apiGet<{ character: Character | null }>('/characters/active').then((d) => setActive(d?.character ?? null));
  }, []);

  useWebSocket((event, data) => {
    if (event === 'character-changed') setActive((data as Character | null) ?? null);
  });

  const pin = async (character: Character) => {
    const result = await apiPost('/characters/active', character);
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setActive(character);
  };

  const unpin = async () => {
    const ok = await apiDelete('/characters/active');
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    setActive(null);
  };

  const errorHint = () => {
    if (loadError?.error === 'no_database') return 'Keine Figuren-Datenbank konfiguriert.';
    if (loadError?.error === 'no_token') return 'Kein Notion-Token hinterlegt — trag ihn in den Settings ein.';
    if (loadError?.error === 'notion_error') return 'Notion antwortet, kennt die Datenbank aber nicht. Teile die Seite mit deiner Integration.';
    return 'Notion ist nicht erreichbar.';
  };

  return (
    <div className="panel characters-panel">
      <div className="clips-panel-header">
        <h2>👥 Figuren</h2>
        {active && (
          <button className="btn-export-small" onClick={unpin} title="Aus dem Overlay nehmen">
            ✕ Overlay leeren
          </button>
        )}
        <button className="btn-export-small" onClick={load} title="Aus Notion neu laden">🔄</button>
      </div>

      {active && (
        <div className="character-active">
          <span className="character-active-label">Im Overlay</span>
          <strong>{active.name}</strong>
          {active.role && <span className="character-active-role">{active.role}</span>}
        </div>
      )}

      {loading ? (
        <p className="empty">Lade…</p>
      ) : loadError ? (
        <EmptyState icon="🔌" title="Figuren nicht abrufbar" description={errorHint()} />
      ) : characters.length === 0 ? (
        <EmptyState
          icon="👥"
          title="Noch keine Figuren"
          description="Lege in der Notion-Datenbank eine Figur an, dann erscheint sie hier."
        />
      ) : (
        <div className="character-list">
          {characters.map((c) => (
            <button
              key={c.id}
              className={`character-row ${active?.id === c.id ? 'active' : ''}`}
              onClick={() => pin(c)}
              title="Im Overlay anzeigen"
            >
              {c.image
                ? <img className="character-row-portrait" src={c.image} alt="" />
                : <span className="character-row-portrait placeholder">{ROLE_EMOJI[c.role || ''] || '👤'}</span>}
              <span className="character-row-body">
                <span className="character-row-name">{c.name}</span>
                {c.summary && <span className="character-row-summary">{c.summary}</span>}
              </span>
              {c.role && <span className="character-row-role">{c.role}</span>}
            </button>
          ))}
        </div>
      )}

      <ChatCommands commands={[
        { cmd: '!figur', desc: 'Zeigt die Figur, an der gerade gearbeitet wird' },
      ]} />
    </div>
  );
}
