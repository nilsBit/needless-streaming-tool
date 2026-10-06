import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import StreamCard from '../components/ux/StreamCard';
import MomentCard from '../components/stream/MomentCard';
import { PANEL_REGISTRY } from '../panelRegistry';
import { PANEL_LABELS, findArea } from '../navigation';
import type { PanelKey } from '../panelKeys';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useFeatures } from '../contexts/FeaturesContext';

interface VisibleOverlays { scene: string | null; overlays: string[] }

// One sentence per card, and which overlay sources belong to it — the names
// are the overlay folders under src/overlays, as their OBS url carries them.
const CARDS: Record<string, { sentence: string; overlays: string[] }> = {
  challenge: { sentence: 'Ein Satz, dazu läuft eine Uhr. Der Chat sieht es mit !challenge.', overlays: ['challenge'] },
  issues: { sentence: 'Du sammelst Themen, das Rad entscheidet. Der Chat sieht sie mit !themen.', overlays: ['roulette'] },
  designs: { sentence: 'Du sammelst Vorschläge, der Chat stimmt mit !vote ab.', overlays: ['poll'] },
  progress: { sentence: 'Woran du heute arbeitest, mit Balken und Aufgaben im Stream. Der Chat sieht es mit !progress und !todo.', overlays: ['progress', 'todos'] },
  song: { sentence: 'Zeigt im Stream nur den Titel, der gerade läuft. Zuschauer wünschen sich Songs mit !sr und sehen die Reihe mit !queue.', overlays: ['song'] },
  world: { sentence: 'Die Karte im Stream zeigt den Eintrag, den du im Worldbuilder offen hast.', overlays: ['character'] },
};

// "Im Stream": every trigger on one page, as cards. The order comes from
// navigation.ts, so the panel test still sees one place per panel.
export default function StreamPage() {
  const { panelVisible, isOn } = useFeatures();
  const panels = findArea('stream').subTabs[0].panels.filter((key) => panelVisible(key));
  const { data: visible, refetch } = useApi<VisibleOverlays>('/obs/visible-overlays');
  useWebSocket((event) => {
    if (event === 'obs-scene-changed' || event === 'obs-status') refetch();
  });

  const onScreen = (overlays: string[]): boolean | null => {
    if (!visible || visible.scene === null) return null;
    return overlays.some((name) => visible.overlays.includes(name));
  };

  return (
    <div className="stream-cards">
      {panels.map((key: PanelKey) => {
        const Component = PANEL_REGISTRY[key];
        const card = CARDS[key] ?? { sentence: '', overlays: [] };
        return (
          <StreamCard key={key} title={PANEL_LABELS[key]} sentence={card.sentence} onScreen={onScreen(card.overlays)}>
            <ErrorBoundary fallback={PANEL_LABELS[key]} errorTitle="Fehler" errorMessage="Etwas ist schiefgelaufen." retryLabel="Nochmal versuchen">
              <div data-panel={key}><Component /></div>
            </ErrorBoundary>
          </StreamCard>
        );
      })}
      {panels.length === 0 && !isOn('momente') && (
        <p className="empty">Nichts gewählt. Unter Einstellungen → Programm → „Was dein Stream kann“ schaltest du Funktionen an.</p>
      )}
      {isOn('momente') && <StreamCard
        title="Moment merken"
        sentence="Setzt eine Marke im Stream. Danach landet sie unter „Nach dem Stream → Content planen“, wo du entscheidest, was daraus wird."
        onScreen={null}
      >
        <MomentCard />
      </StreamCard>}
    </div>
  );
}
