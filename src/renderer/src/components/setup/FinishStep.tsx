import React from 'react';
import { useApi } from '../../hooks/useApi';
import { FEATURES, type Feature } from '../../../../shared/features';
import { AREAS } from '../../navigation';
import { stageProgress, useQuests } from '../quests/useQuests';

interface ReadinessItem { id: string; ok: boolean | null; severity: 'error' | 'hint'; title: string; problem: string; consequence: string }
interface Readiness { ready: boolean; items: ReadinessItem[] }

interface Props { picked: ReadonlySet<string> }

/** Where a feature lives in the app, by the first panel it claims. */
function whereIs(f: Feature): string {
  for (const area of AREAS) {
    for (const tab of area.subTabs) {
      if (f.panels.some((p) => tab.panels.includes(p as never))) return area.subTabs.length > 1 ? `${area.label} → ${tab.label}` : area.label;
    }
  }
  if (f.overlays.length) return 'Overlays & Alerts → Overlays';
  if (f.key === 'discord') return 'von selbst, beim Live-Gehen';
  return 'Chat & Bot';
}

// Step 4: the end of the first quest (08.10.) — the stage reached, what the
// stream can do and where it lives, what stands and what is missing, and the
// next quests for what was chosen.
export default function FinishStep({ picked }: Props) {
  const { data: readiness } = useApi<Readiness>('/readiness');
  const on = FEATURES.filter((f) => picked.has(f.key));
  const hidden = FEATURES.length - on.length;
  const items = readiness?.items ?? [];
  const { quests } = useQuests();
  const nextQuests = (quests?.open ?? []).filter((q) => q.key !== 'choose').slice(0, 4);

  return (
    <div className="setup-finish">
    {quests && (
      <section className="quest-stage" aria-label="Deine Stufe">
        <span className="quest-stage-ring" aria-hidden="true">{quests.stage.level}</span>
        <div className="quest-stage-text">
          <span className="quest-kicker">Erste Quest geschafft</span>
          <span className="quest-stage-name">{quests.stage.name} · {quests.stage.xp} EP</span>
          <div className="quest-bar" aria-hidden="true"><span style={{ width: `${Math.round(stageProgress(quests.stage) * 100)}%` }} /></div>
          {quests.stage.next && <span className="dialog-hint">Noch {quests.stage.next.from - quests.stage.xp} EP bis {quests.stage.next.name}</span>}
        </div>
      </section>
    )}
    <div className="setup-cols">
      <section className="setup-col" aria-labelledby="fin-can">
        <h2 id="fin-can">Was dein Stream kann</h2>
        {on.length === 0 && <p className="dialog-hint">Nichts gewählt – die App zeigt nur Einstellungen, Statistik und Hilfe.</p>}
        <ul className="setup-list">
          {on.map((f) => <li key={f.key}><span>{f.label}</span><span className="dialog-hint">{whereIs(f)}</span></li>)}
        </ul>
        {hidden > 0 && <p className="dialog-hint">{hidden} {hidden === 1 ? 'Funktion ist' : 'Funktionen sind'} ausgeblendet, nicht weg. Einschalten: Einstellungen → Programm → „Was dein Stream kann“.</p>}
      </section>

      <section className="setup-col" aria-labelledby="fin-ready">
        <h2 id="fin-ready">Was steht</h2>
        {!readiness && <p className="dialog-hint">Prüft …</p>}
        {readiness && items.length === 0 && <p className="dialog-hint">Deine Auswahl braucht nichts, was fehlen könnte.</p>}
        <ul className="setup-checks">
          {items.map((i) => (
            <li key={i.id}>
              <span className={`obs-row-dot ${i.ok === true ? 'on' : i.ok === false ? (i.severity === 'error' ? 'bad' : 'warn') : ''}`} aria-hidden="true" />
              <span>{i.ok === false ? `${i.problem} ${i.consequence}` : i.ok === null ? `${i.title} – erst zu sehen, wenn OBS verbunden ist.` : i.title}</span>
            </li>
          ))}
        </ul>
        {readiness && items.some((i) => i.ok === false) && <p className="dialog-hint">Solange etwas fehlt, steht es als Balken oben auf „Im Stream“, mit einem Knopf, der dich hinbringt.</p>}
      </section>

      <section className="setup-col" aria-labelledby="fin-next">
        <h2 id="fin-next">Deine nächsten Quests</h2>
        {!quests && <p className="dialog-hint">Lädt …</p>}
        <ul className="setup-quests">
          {nextQuests.map((q) => <li key={q.key}><span className="quest-row-title">{q.title}<span className="quest-xp">+{q.xp} EP</span></span><span className="dialog-hint">{q.text}</span></li>)}
        </ul>
        <p className="dialog-hint">Im Bereich „Quests“ geht es weiter – „Los geht's“ bringt dich jeweils hin.</p>
      </section>
    </div>
    </div>
  );
}
