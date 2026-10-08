import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '../NavigationContext';
import { apiPost } from '../hooks/useApi';
import { stageProgress, useQuests, type QuestView } from '../components/quests/useQuests';
import { startQuest } from '../components/quests/questStart';

const day = (iso: string) => new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

// "Quests" (spec 2026-10-08-quests-design, the canvas "Quests – geführt statt
// stuck"): the stage, then the chapters — each with its progress and badge —
// and in them the quests, each opening to why it is worth it and how it is
// done, with "Los geht's". A quest that waits for another says what for.
// A short intro comes the first time. Viewers see none of this.
export default function QuestsPanel() {
  const go = useNavigate();
  const { quests, refetch } = useQuests();
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!quests) return <div className="panel"><p className="empty">Laden …</p></div>;
  const { stage, next, chapters, introSeen } = quests;
  const pct = Math.round(stageProgress(stage) * 100);
  const start = (q: QuestView) => startQuest(q.key, q.goTo, go as never);
  const closeIntro = async () => { await apiPost('/quests/intro-seen', {}); refetch(); };

  return (
    <div className="panel quests">
      <section className="quest-stage" aria-label="Deine Stufe">
        <span className="quest-stage-ring" aria-hidden="true">{stage.level}</span>
        <div className="quest-stage-text">
          <span className="quest-kicker">Deine Stufe</span>
          <span className="quest-stage-name">{stage.name}</span>
          <div className="quest-bar" role="progressbar" aria-label="Erfahrung" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
          <span className="dialog-hint">{stage.next ? `${stage.xp} EP · noch ${stage.next.from - stage.xp} bis ${stage.next.name}` : `${stage.xp} EP · höchste Stufe`}</span>
        </div>
      </section>

      {chapters.map((c) => (
        <section key={c.n} className={`quest-chapter ${c.complete ? 'complete' : ''} ${c.locked ? 'locked' : ''}`} aria-label={`Kapitel ${c.n}`}>
          <div className="quest-chapter-head">
            <span className="quest-chapter-n" aria-hidden="true">{c.complete ? '★' : c.n}</span>
            <div className="quest-chapter-text">
              <span className="quest-kicker">Kapitel {c.n}</span>
              <strong className="quest-chapter-title">{c.title}</strong>
              <div className="quest-bar small" aria-hidden="true"><span style={{ width: `${Math.round((c.done / c.total) * 100)}%` }} /></div>
            </div>
            <div className="quest-chapter-side">
              <span>{c.done} von {c.total}</span>
              <span className={`quest-badge ${c.complete ? 'earned' : ''}`}>Abzeichen: {c.badge}</span>
            </div>
          </div>
          {c.locked ? (
            <p className="dialog-hint" style={{ margin: 0 }}>Wird frei, wenn Kapitel {c.after} geschafft ist.</p>
          ) : (
            <div className="quest-list">
              {c.quests.map((q) => {
                const done = !!q.completedAt;
                const isNext = next?.key === q.key;
                const open = openKey === q.key;
                return (
                  <div key={q.key} className={`quest-item ${done ? 'done' : ''} ${isNext ? 'next' : ''} ${q.blockedBy ? 'blocked' : ''}`}>
                    <button type="button" className="quest-item-head" aria-expanded={open} onClick={() => setOpenKey(open ? null : q.key)}>
                      <span className={`quest-dot ${done ? 'done' : ''}`} aria-hidden="true">{done ? '✓' : ''}</span>
                      <span className="quest-item-title">{q.title}</span>
                      {q.blockedBy && <span className="quest-chip">{q.blockedBy}</span>}
                      {isNext && <span className="quest-chip next">Als Nächstes</span>}
                      {done && q.completedAt && <span className="dialog-hint">{day(q.completedAt)}</span>}
                      <span className="quest-xp">+{q.xp}</span>
                    </button>
                    {open && (
                      <div className="quest-item-body">
                        <div><span className="quest-label">Warum</span><p>{q.why}</p></div>
                        {q.how.length > 0 && <div><span className="quest-label">So geht's</span><ol>{q.how.map((h) => <li key={h}>{h}</li>)}</ol></div>}
                        {!done && !q.blockedBy && <button type="button" className="card-primary" onClick={() => start(q)}>Los geht's</button>}
                        {q.blockedBy && <p className="dialog-hint" style={{ margin: 0 }}>Geht, sobald die Quest davor geschafft ist. Bis dahin schlägt dir das Tool etwas anderes vor.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}

      <p className="dialog-hint" style={{ margin: 0 }}>Stufe, EP, Kapitel und Abzeichen siehst nur du. Sie zeigen, wie weit du dein Tool eingerichtet hast.</p>

      {!introSeen && createPortal(
        <div className="quest-moment-backdrop">
          <section className="quest-intro" role="dialog" aria-label="So funktionieren Quests">
            <span className="quest-kicker">Willkommen</span>
            <strong className="quest-moment-title">So kommst du durchs Tool</strong>
            <ol className="quest-intro-list">
              <li><span>1</span><p><strong>Quests</strong> zeigen dir Schritt für Schritt, was du einrichten kannst – jede mit „Warum“ und „So geht's“.</p></li>
              <li><span>2</span><p>Die <strong>aktive Quest</strong> steht immer unten in der Leiste. „Los geht's“ bringt dich hin und zeigt, was du klicken musst.</p></li>
              <li><span>3</span><p>Jede Quest bringt <strong>EP</strong>, jedes Kapitel ein <strong>Abzeichen</strong>. Mit genug EP steigst du eine Stufe auf. Das siehst nur du.</p></li>
            </ol>
            <button type="button" className="card-primary" onClick={() => void closeIntro()} autoFocus>Los geht's</button>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
