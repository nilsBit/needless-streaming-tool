import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import StreamCard, { type SceneState } from '../components/ux/StreamCard';
import { openAt } from '../components/ux/openAt';
import { useNavigate } from '../NavigationContext';
import MomentCard from '../components/stream/MomentCard';
import { PANEL_REGISTRY } from '../panelRegistry';
import { PANEL_LABELS, findArea } from '../navigation';
import type { PanelKey } from '../panelKeys';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useFeatures } from '../contexts/FeaturesContext';

interface VisibleOverlays { scene: string | null; overlays: string[] }
interface OverlayScenes { connected: boolean; byOverlay: Record<string, string[]> }

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
// navigation.ts, so the panel test still sees one place per panel — except
// that cards whose overlay is in the current scene come first, then those in
// another scene, then those in none (09.10.: what is live belongs together).
export default function StreamPage() {
  const { panelVisible, isOn } = useFeatures();
  const panels = findArea('stream').subTabs[0].panels.filter((key) => panelVisible(key));
  const go = useNavigate();
  const { data: visible, refetch } = useApi<VisibleOverlays>('/obs/visible-overlays');
  const { data: placement, refetch: refetchPlacement } = useApi<OverlayScenes>('/obs/overlay-scenes');
  useWebSocket((event) => {
    if (event === 'obs-scene-changed' || event === 'obs-status') { refetch(); refetchPlacement(); }
  });

  const sceneOf = (overlays: string[]): SceneState => {
    if (!visible || visible.scene === null) return null;
    if (overlays.some((name) => visible.overlays.includes(name))) return { state: 'on' };
    if (!placement?.connected) return null;
    const where = [...new Set(overlays.flatMap((name) => placement.byOverlay[name] ?? []))];
    return where.length ? { state: 'elsewhere', where } : { state: 'none' };
  };
  const rank = (s: SceneState) => (s?.state === 'on' ? 0 : s?.state === 'elsewhere' ? 1 : s?.state === 'none' ? 2 : 1);
  const ordered = panels
    .map((key, i) => ({ key, i, scene: sceneOf((CARDS[key] ?? { overlays: [] }).overlays) }))
    .sort((a, b) => rank(a.scene) - rank(b.scene) || a.i - b.i);

  return (
    <div className="stream-cards">
      {ordered.map(({ key, scene }: { key: PanelKey; scene: SceneState }) => {
        const Component = PANEL_REGISTRY[key];
        const card = CARDS[key] ?? { sentence: '', overlays: [] };
        const place = card.overlays[0] ? () => { go({ area: 'overlays', subTab: 'overlays' }); openAt('overlay', `${card.overlays[0]}:obs`); } : undefined;
        return (
          <StreamCard key={key} title={PANEL_LABELS[key]} sentence={card.sentence} scene={scene} onPlace={place}>
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
        sentence="Setzt eine Marke im Stream. Nach dem Stream steht sie im Ablauf, mit Uhrzeit und deiner Notiz."
        scene={null}
      >
        <MomentCard />
      </StreamCard>}
    </div>
  );
}
