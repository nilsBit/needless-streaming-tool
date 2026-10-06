import React from 'react';
import { useApi } from '../../hooks/useApi';
import { FEATURES, type Feature } from '../../../../shared/features';
import { AREAS } from '../../navigation';

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

// Step 4: what the stream can do and where it lives, what stands and what is
// missing, and the rewards to create in Twitch when channel points are part
// of the choice.
export default function FinishStep({ picked }: Props) {
  const { data: readiness } = useApi<Readiness>('/readiness');
  const on = FEATURES.filter((f) => picked.has(f.key));
  const hidden = FEATURES.length - on.length;
  const rewards = picked.has('bestenliste') || picked.has('belohnungen');
  const items = readiness?.items ?? [];

  return (
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
        {rewards ? (
          <>
            <h2 id="fin-next">In Twitch noch anlegen</h2>
            <p className="dialog-hint">Belohnungen legst du in Twitch an (Creator-Dashboard → Kanalpunkte). Die meisten erkennt das Tool am Namen; Bestenlisten wählst du unter Overlays & Alerts → Bestenlisten aus.</p>
            <ul className="setup-list">
              <li><span>Für jede <strong>Bestenliste</strong> eine Belohnung</span><span className="dialog-hint">wird unter Overlays & Alerts → Bestenlisten gewählt – jede Einlösung zählt</span></li>
              <li><span>Name enthält <strong>Roulette</strong></span><span className="dialog-hint">dreht das Glücksrad</span></li>
              <li><span>Name enthält <strong>Musik</strong> oder <strong>Song</strong></span><span className="dialog-hint">ändert die Musik</span></li>
              <li><span>Name enthält <strong>Szene</strong></span><span className="dialog-hint">wechselt kurz die Szene</span></li>
              <li><span>Name enthält <strong>Feature</strong></span><span className="dialog-hint">reicht einen Vorschlag ein</span></li>
              <li><span>Jede andere Belohnung</span><span className="dialog-hint">zählt in der Statistik, in keiner Bestenliste</span></li>
            </ul>
          </>
        ) : (
          <>
            <h2 id="fin-next">So geht es weiter</h2>
            <ul className="setup-list setup-list-plain">
              {picked.has('befehle') && <li>Den ersten eigenen Befehl anlegen – unter Chat & Bot → Befehle, etwa !welt mit einem Satz zu deinem Stream.</li>}
              {picked.has('alerts') && <li>Den Alerts einen Ton geben – unter Overlays & Alerts → Alerts, je Anlass eine Datei.</li>}
              {picked.has('momente') && <li>Im Stream „Moment merken“ drücken, wenn etwas passiert. Danach wird daraus Content.</li>}
              <li>Twitch, OBS und alles andere jederzeit unter Einstellungen → Verbindungen.</li>
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
