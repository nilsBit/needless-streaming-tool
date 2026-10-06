import React, { useRef, useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete, getApiToken, getApiBase } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { Clip, ClipStatus } from '../../../shared/types';
import Dialog from '../components/ux/Dialog';
import NotionSetupModal from '../components/NotionSetupModal';

// "Content planen" under Nach dem Stream: the moments marked during the
// stream — and ideas without one — on a board with four steps. A card is a
// single click; the dialog holds step, platforms, date, hook, tag, note. What
// the tool marked itself waits in "Neu" with "Behalten" / "Verwerfen".
// Published moments leave the board after 30 days into the archive.

const STEPS: { key: ClipStatus; label: string }[] = [
  { key: 'new', label: 'Neu' },
  { key: 'planned', label: 'Geplant' },
  { key: 'cut', label: 'Geschnitten' },
  { key: 'published', label: 'Veröffentlicht' },
];
const PLATFORMS: { key: string; label: string }[] = [
  { key: 'tiktok', label: 'TikTok' }, { key: 'shorts', label: 'Shorts' }, { key: 'reels', label: 'Reels' }, { key: 'discord', label: 'Discord' }, { key: 'twitch', label: 'Twitch-Clip' },
];
const TAG_LABELS: Record<string, string> = { highlight: 'Highlight', fail: 'Panne', funny: 'Lustig', tutorial: 'Erklärt', issue: 'Thema', idee: 'Idee', milestone: 'Meilenstein', reward: 'Kanalpunkt', hype: 'Hype' };

interface ClipTag { tag: string; emoji: string; preset: boolean }
interface SessionInfo { session_date: string; count: number }

const tagLabel = (tag: string) => { const base = tag.replace(/^auto-/, ''); return TAG_LABELS[base] ?? base; };
const dayOf = (iso: string) => new Date(iso.includes('T') ? iso : iso + 'Z');
const shortDate = (d: Date) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const longDate = (ymd: string) => new Date(ymd + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' });
const minute = (tc: string | null) => { if (!tc) return null; const [h, m] = tc.split(':'); return `${Number(h)}:${m}`; };

export default function ClipsPanel() {
  const { toast } = useToast();
  const { data: all, refetch } = useApi<Clip[]>('/clips?archived=all');
  const { data: sessions, refetch: refetchSessions } = useApi<SessionInfo[]>('/clips/sessions');
  const { data: clipTags } = useApi<ClipTag[]>('/clip-tags');
  const { data: dbInfo } = useApi<{ configured: boolean }>('/settings/notion/database');
  const { data: autoSyncRaw, refetch: refetchAutoSync } = useApi<{ value: string | null }>('/settings/get/notion_auto_sync');
  const notionConfigured = !!dbInfo?.configured;
  const autoSync = autoSyncRaw?.value === 'true';

  const [openId, setOpenId] = useState<number | null>(null);
  const [idea, setIdea] = useState<{ hook: string; note: string } | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<ClipStatus | null>(null);
  const [exportDay, setExportDay] = useState('');
  const [notionModal, setNotionModal] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useWebSocket((event) => {
    if (event.startsWith('clip-')) { refetch(); refetchSessions(); }
  });

  const clips = all ?? [];
  const board = clips.filter((c) => !c.archived_at);
  const archived = clips.filter((c) => !!c.archived_at);
  const open = clips.find((c) => c.id === openId) ?? null;
  const isAuto = (c: Clip) => c.tag.startsWith('auto-');

  const patch = async (id: number, change: Record<string, unknown>) => {
    const result = await apiPatch(`/clips/${id}`, change);
    if (!result) { toast.error('Nicht gespeichert'); return false; }
    refetch();
    return true;
  };
  const move = (id: number, status: ClipStatus) => patch(id, { status });
  const keep = (c: Clip) => patch(c.id, { tag: c.tag.replace(/^auto-/, '') || 'highlight' });
  const remove = async (c: Clip) => {
    if (!window.confirm(`„${c.hook || c.note || tagLabel(c.tag)}“ löschen?`)) return;
    const ok = await apiDelete(`/clips/${c.id}`);
    if (!ok) { toast.error('Löschen fehlgeschlagen'); return; }
    if (openId === c.id) setOpenId(null);
    refetch(); refetchSessions();
  };
  const createIdea = async () => {
    if (!idea || !idea.hook.trim()) return;
    const result = await apiPost<Clip>('/clips', { idea: true, hook: idea.hook.trim(), note: idea.note.trim() || undefined });
    if (!result) { toast.error('Idee nicht gespeichert'); return; }
    setIdea(null);
    refetch();
    setOpenId(result.id);
  };
  const toggleAutoSync = async () => {
    if (!notionConfigured) { setNotionModal(true); return; }
    await apiPost('/settings/set', { key: 'notion_auto_sync', value: autoSync ? 'false' : 'true' });
    refetchAutoSync();
  };
  const syncDay = async (sessionDate: string) => {
    const result = await apiPost<{ synced: number; total: number }>('/clips/sync', { session_date: sessionDate });
    if (!result) { toast.error('Nicht nach Notion geschickt'); return; }
    toast.success(`${result.synced} von ${result.total} nach Notion geschickt`);
  };
  const exportCsv = () => {
    if (!exportDay) return;
    window.open(`${getApiBase()}/clips/export?session_date=${exportDay}&token=${getApiToken()}`, '_blank');
  };

  const statusLine = (c: Clip): string | null => {
    if (c.status === 'new') return null;
    const names = c.platforms.map((p) => PLATFORMS.find((x) => x.key === p)?.label ?? p);
    const when = c.status === 'published'
      ? (c.published_at ? `seit ${shortDate(dayOf(c.published_at))}` : '')
      : (c.planned_for ? longDate(c.planned_for) : '');
    const parts = [names.join(', '), when].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Noch ohne Plattform und Termin';
  };
  const meta = (c: Clip): string => {
    const parts = [shortDate(dayOf(c.created_at))];
    const m = minute(c.stream_timecode);
    if (m) parts.push(`${m} im Stream`);
    if (c.tag !== 'idee') parts.push(tagLabel(c.tag));
    else parts.push('Idee');
    return parts.join(' · ');
  };
  const title = (c: Clip) => c.hook || c.note || tagLabel(c.tag);

  const onDrop = async (status: ClipStatus) => {
    setDragOver(null);
    if (dragId === null) return;
    const c = clips.find((x) => x.id === dragId);
    setDragId(null);
    if (c && c.status !== status) await move(c.id, status);
  };

  const tagOptions = Array.from(new Set([...(clipTags ?? []).map((t) => t.tag), 'idee', ...(open ? [open.tag.replace(/^auto-/, '')] : [])]));
  const nextStep = open ? STEPS[STEPS.findIndex((s) => s.key === open.status) + 1] : undefined;

  return (
    <div className="panel card-slim board-panel">
      <div className="card-line card-wrap">
        <span className="card-status"><span>Aus Momenten wird Content. Karte anklicken, um sie weiterzuschieben und Plattform, Termin und Hook festzulegen. Ziehen in eine andere Spalte geht auch.</span></span>
        <button type="button" className="card-primary" onClick={() => setIdea({ hook: '', note: '' })}>+ Idee</button>
      </div>

      {!showArchive ? (
        <div className="board">
          {STEPS.map((step) => {
            const cards = board.filter((c) => c.status === step.key);
            return (
              <section
                key={step.key}
                className={`board-col ${dragOver === step.key ? 'drag-over' : ''}`}
                aria-label={step.label}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDragEnter={() => setDragOver(step.key)}
                onDragLeave={(e) => { const related = e.relatedTarget as HTMLElement | null; if (!related || !(e.currentTarget as HTMLElement).contains(related)) setDragOver((v) => (v === step.key ? null : v)); }}
                onDrop={(e) => { e.preventDefault(); void onDrop(step.key); }}
              >
                <div className="board-col-head"><h3>{step.label}</h3><span>{cards.length}</span></div>
                {cards.length === 0 && <p className="board-empty">{step.key === 'new' ? 'Nichts Neues. „Moment merken“ unter Im Stream legt hier ab.' : 'Hierher ziehen'}</p>}
                {cards.map((c) => isAuto(c) ? (
                  <div key={c.id} className="board-card auto">
                    <span className="board-card-title">{title(c)}</span>
                    <span className="board-card-meta">{meta(c)} · vom Tool gemerkt</span>
                    <div className="card-row"><button type="button" className="card-primary board-small" onClick={() => keep(c)}>Behalten</button><button type="button" className="card-secondary board-small" onClick={() => remove(c)}>Verwerfen</button></div>
                  </div>
                ) : (
                  <button
                    key={c.id}
                    type="button"
                    className={`board-card ${dragId === c.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(c.id)); e.dataTransfer.effectAllowed = 'move'; setDragId(c.id); }}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    onClick={() => setOpenId(c.id)}
                  >
                    <span className="board-card-title">{title(c)}</span>
                    <span className="board-card-meta">{meta(c)}</span>
                    {statusLine(c) && <span className="board-card-status">{statusLine(c)}</span>}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="board-archive">
          {archived.length === 0 && <p className="dialog-empty">Noch nichts im Archiv. Veröffentlichtes wandert nach 30 Tagen hierher.</p>}
          <ul className="dialog-list">
            {archived.map((c) => (
              <li key={c.id}>
                <span className="dialog-list-text">{title(c)} <span className="dialog-hint">· {meta(c)}{c.published_at ? ` · veröffentlicht ${shortDate(dayOf(c.published_at))}` : ''}</span></span>
                <button type="button" className="card-link" onClick={() => setOpenId(c.id)}>Öffnen</button>
                <button type="button" className="card-link" onClick={() => patch(c.id, { status: 'cut' })}>Zurück aufs Brett</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-line card-wrap board-foot">
        <div className="card-links">
          <button type="button" className="card-link" onClick={() => setShowArchive((v) => !v)}>{showArchive ? 'Zurück zum Brett' : `Archiv anzeigen${archived.length ? ` · ${archived.length}` : ''}`}</button>
          <button type="button" className="card-link" onClick={toggleAutoSync}>Notion-Übergabe von selbst: {notionConfigured && autoSync ? 'an' : 'aus'}</button>
        </div>
        <div className="card-row card-wrap">
          <select className="card-select" aria-label="Stream-Tag" value={exportDay} onChange={(e) => setExportDay(e.target.value)}>
            <option value="">Stream-Tag wählen …</option>
            {(sessions ?? []).map((s) => <option key={s.session_date} value={s.session_date}>{longDate(s.session_date)} · {s.count}</option>)}
          </select>
          <button type="button" className="card-secondary" onClick={exportCsv} disabled={!exportDay}>Als CSV für DaVinci</button>
          {notionConfigured && <button type="button" className="card-link" onClick={() => exportDay && syncDay(exportDay)} disabled={!exportDay}>Tag nach Notion schicken</button>}
        </div>
      </div>

      {open && (
        <Dialog
          title={title(open)}
          sentence={meta(open)}
          onClose={() => setOpenId(null)}
          footer={<>
            <button type="button" className="card-link" onClick={() => remove(open)}>Löschen</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-primary" onClick={() => setOpenId(null)}>Fertig</button>
          </>}
        >
          <div className="board-steps">
            <span className="dialog-field-label">Schritt</span>
            {STEPS.map((s) => (
              <button key={s.key} type="button" className={`pill ${open.status === s.key ? 'active' : ''}`} aria-pressed={open.status === s.key} onClick={() => open.status !== s.key && move(open.id, s.key)}>{s.label}</button>
            ))}
            <span style={{ flex: 1 }} />
            {nextStep && <button type="button" className="card-primary" onClick={() => move(open.id, nextStep.key)}>Weiter zu {nextStep.label}</button>}
          </div>
          <div className="dialog-grid">
            <div className="dialog-field">
              <span className="dialog-field-label">Plattformen</span>
              <div className="card-row card-wrap">
                {PLATFORMS.map((p) => (
                  <label key={p.key} className="card-check">
                    <input type="checkbox" checked={open.platforms.includes(p.key)} onChange={(e) => patch(open.id, { platforms: e.target.checked ? [...open.platforms, p.key] : open.platforms.filter((x) => x !== p.key) })} />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="dialog-field">
              <label htmlFor="clip-date">Termin</label>
              <input id="clip-date" type="date" className="card-select" value={open.planned_for ?? ''} onChange={(e) => patch(open.id, { planned_for: e.target.value || null })} style={{ colorScheme: 'dark' }} />
            </div>
          </div>
          <div className="dialog-grid">
            <div className="dialog-field">
              <label htmlFor="clip-hook">Titel oder Hook</label>
              <input id="clip-hook" type="text" maxLength={200} defaultValue={open.hook ?? ''} key={`hook-${open.id}`} placeholder="Wie das Posting anfängt" onBlur={(e) => e.target.value !== (open.hook ?? '') && patch(open.id, { hook: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            </div>
            <div className="dialog-field">
              <label htmlFor="clip-tag">Schlagwort</label>
              <select id="clip-tag" className="card-select" value={open.tag.replace(/^auto-/, '')} onChange={(e) => patch(open.id, { tag: e.target.value })}>
                {tagOptions.map((t) => <option key={t} value={t}>{tagLabel(t)}</option>)}
              </select>
            </div>
          </div>
          <div className="dialog-field">
            <label htmlFor="clip-note">Notiz</label>
            <textarea id="clip-note" rows={4} defaultValue={open.note ?? ''} key={`note-${open.id}`} placeholder="Was im Clip zu sehen sein soll, Schnittidee, Text fürs Posting …"
              onChange={(e) => { const value = e.target.value; if (noteTimer.current) clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => patch(open.id, { note: value }), 600); }} />
          </div>
          <div className="card-status">
            {open.stream_timecode && <span>Im Stream bei {minute(open.stream_timecode)}{open.recording_timecode ? ` · in der Aufnahme bei ${minute(open.recording_timecode)}` : ''}.</span>}
            {open.confidence && <span>Erkannt mit {open.confidence === 'high' ? 'hoher' : 'mittlerer'} Sicherheit.</span>}
            {notionConfigured && <button type="button" className="card-link" onClick={() => syncDay(open.session_date)}>Stream-Tag nach Notion schicken</button>}
            {open.notion_page_id && <span>In Notion vorhanden.</span>}
          </div>
        </Dialog>
      )}

      {idea && (
        <Dialog
          title="Neue Idee"
          sentence="Content, der nicht aus einem Stream-Moment kommt. Landet unter „Neu“."
          onClose={() => setIdea(null)}
          width={560}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => setIdea(null)}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={createIdea} disabled={!idea.hook.trim()}>Anlegen</button>
          </>}
        >
          <div className="dialog-field">
            <label htmlFor="idea-hook">Titel oder Hook</label>
            <input id="idea-hook" type="text" maxLength={200} value={idea.hook} onChange={(e) => setIdea({ ...idea, hook: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && createIdea()} autoFocus />
          </div>
          <div className="dialog-field">
            <label htmlFor="idea-note">Notiz</label>
            <textarea id="idea-note" rows={3} value={idea.note} onChange={(e) => setIdea({ ...idea, note: e.target.value })} />
          </div>
        </Dialog>
      )}

      <NotionSetupModal
        open={notionModal}
        onClose={() => setNotionModal(false)}
        onComplete={async () => { setNotionModal(false); await apiPost('/settings/set', { key: 'notion_auto_sync', value: 'true' }); refetchAutoSync(); toast.success('Notion verbunden – Übergabe von selbst ist an'); }}
      />
    </div>
  );
}
