import React from 'react';
import { useNavigate, type NavTarget } from '../NavigationContext';
import { stageProgress, useQuests, type QuestView } from '../components/quests/useQuests';

const GROUPS: Record<string, string> = {
  start: 'Start', befehle: 'Befehle', punkte: 'Eigene Punkte', kanalpunkte: 'Kanalpunkte', bestenliste: 'Bestenlisten',
  rad: 'Glücksrad', alerts: 'Alerts', momente: 'Momente', discord: 'Discord', welt: 'Welt',
};

const day = (iso: string) => new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

// "Quests": the streamer's stage, the one quest to do next, the open ones by
// group and what is done (spec 2026-10-08-quests-design). Each open quest
// leads where it is done. Viewers see none of this.
export default function QuestsPanel() {
  const go = useNavigate();
  const { quests } = useQuests();
  if (!quests) return <div className="panel"><p className="empty">Laden …</p></div>;
  const { stage, next, open, done, choosing } = quests;
  const pct = Math.round(stageProgress(stage) * 100);
  const goTo = (q: QuestView) => go(q.goTo as NavTarget);
  const rest = open.filter((q) => q.key !== next?.key);
  const groups = [...new Set(rest.map((q) => q.group))];

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
        <span className="quest-stage-count">{done.length} von {done.length + open.length} geschafft</span>
      </section>

      {next && (
        <section className="quest-next" aria-label="Als Nächstes">
          <span className="quest-kicker">Als Nächstes</span>
          <div className="quest-next-body">
            <div>
              <h3 className="quest-next-title">{next.title}</h3>
              <p className="quest-next-text">{next.text}</p>
            </div>
            <span className="quest-xp">+{next.xp} EP</span>
          </div>
          <button type="button" className="card-primary" onClick={() => goTo(next)}>Los geht's</button>
          {choosing && <p className="dialog-hint" style={{ margin: 0 }}>Danach zeigt dir das Tool genau die Quests zu dem, was du gewählt hast.</p>}
        </section>
      )}
      {!next && <p className="dialog-empty">Alle Quests geschafft. Neue kommen mit neuen Funktionen.</p>}

      {groups.map((g) => (
        <section key={g} className="quest-group" aria-label={GROUPS[g] ?? g}>
          <h3 className="dialog-section">{GROUPS[g] ?? g}</h3>
          {rest.filter((q) => q.group === g).map((q) => (
            <div key={q.key} className="quest-row">
              <span className="quest-dot" aria-hidden="true" />
              <div className="quest-row-text"><span className="quest-row-title">{q.title}</span><span className="dialog-hint">{q.text}</span></div>
              <span className="quest-xp">+{q.xp}</span>
              <button type="button" className="card-secondary" onClick={() => goTo(q)}>Los geht's</button>
            </div>
          ))}
        </section>
      ))}

      {done.length > 0 && (
        <section className="quest-group" aria-label="Geschafft">
          <h3 className="dialog-section">Geschafft</h3>
          {done.map((q) => (
            <div key={q.key} className="quest-row done">
              <span className="quest-dot done" aria-hidden="true">✓</span>
              <div className="quest-row-text"><span className="quest-row-title">{q.title}</span><span className="dialog-hint">{q.completedAt ? day(q.completedAt) : ''}</span></div>
              <span className="quest-xp">+{q.xp}</span>
            </div>
          ))}
        </section>
      )}
      <p className="dialog-hint" style={{ margin: 0 }}>Stufe, EP und Quests siehst nur du. Sie zeigen, wie weit du dein Tool eingerichtet hast.</p>
    </div>
  );
}
