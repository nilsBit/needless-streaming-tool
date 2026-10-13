import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import StreamCard, { type SceneState } from '../components/ux/StreamCard';
import { openAt } from '../components/ux/openAt';
import { useNavigate } from '../NavigationContext';
import MomentCard from '../components/stream/MomentCard';
import { PANEL_REGISTRY } from '../panelRegistry';
import { PANEL_LABELS, findArea } from '../navigation';
import type { PanelKey } from '../panelKeys';
import { useApi, apiPost } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useFeatures } from '../contexts/FeaturesContext';
import { useCompact } from '../hooks/useCompact';
import CompactRow from '../components/compact/CompactRow';
import SceneHint from '../components/ux/SceneHint';

interface VisibleOverlays { scene: string | null; overlays: string[] }
interface OverlayScenes { connected: boolean; byOverlay: Record<string, string[]> }

// One sentence per card, and which overlay sources belong to it — the names
// are the overlay folders under src/overlays, as their OBS url carries them.
const CARDS: Record<string, { sentence: string; overlays: string[] }> = {
  challenge: { sentence: 'Ein Satz, dazu läuft eine Uhr. Der Chat sieht es mit !challenge.', overlays: ['challenge'] },
  issues: { sentence: 'Du sammelst Themen, das Rad entscheidet. Der Chat sieht sie mit !themen.', overlays: ['roulette'] },
  designs: { sentence: 'Du sammelst Vorschläge, der Chat stimmt mit !vote ab.', overlays: ['poll'] },
  progress: { sentence: 'Woran du über mehrere Streams arbeitest und wie weit es ist. Der Chat fragt mit !projekt.', overlays: ['progress'] },
  song: { sentence: 'Zeigt im Stream nur den Titel, der gerade läuft.', overlays: ['song'] },
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

  // "Heute dabei" (12.10., canvas draft C): the streamer picks the cards for
  // today; the rest waits in the strip. What is stored is the cards set aside,
  // so a feature switched on later shows up at once.
  const { data: asideSetting, refetch: refetchAside } = useApi<{ value: string | null }>(`/settings/get/${ASIDE_KEY}`);
  const aside = parseAside(asideSetting?.value ?? null);
  const isToday = (key: PanelKey) => !aside.includes(key);
  const toggleToday = async (key: PanelKey) => {
    const next = isToday(key) ? [...aside, key] : aside.filter((k) => k !== key);
    await apiPost('/settings/set', { key: ASIDE_KEY, value: JSON.stringify(next) });
    refetchAside();
  };
  const shown = ordered.filter(({ key }) => isToday(key));

  // Small window (12.10.): "Heute dabei" folds into one button, each card is
  // a row with its main button; "Moment merken" sits in the bar on top.
  const compact = useCompact();
  const [todayOpen, setTodayOpen] = React.useState(false);
  const [openRow, setOpenRow] = React.useState<PanelKey | null>(null);
  const chips = (
    <div className="stream-today-chips">
      {panels.map((key) => (
        <button key={key} type="button" className={`stream-today-chip${isToday(key) ? ' on' : ''}`} aria-pressed={isToday(key)} onClick={() => void toggleToday(key)}>
          {isToday(key) ? '✓ ' : ''}{PANEL_LABELS[key]}
        </button>
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className="stream-page compact">
        {panels.length > 0 && (
          <div className="compact-today">
            <button type="button" className="compact-today-btn" aria-expanded={todayOpen} onClick={() => setTodayOpen(!todayOpen)}>
              Heute: {shown.length} {todayOpen ? '▴' : '▾'}
            </button>
            <SceneHint />
          </div>
        )}
        {todayOpen && chips}
        <div className="compact-rows">
          {shown.map(({ key, scene }) => {
            const Component = PANEL_REGISTRY[key];
            return (
              <CompactRow key={key} panel={key} title={PANEL_LABELS[key]} onScreen={scene?.state === 'on'} open={openRow === key} onToggle={() => setOpenRow(openRow === key ? null : key)}>
                <ErrorBoundary fallback={PANEL_LABELS[key]} errorTitle="Fehler" errorMessage="Etwas ist schiefgelaufen." retryLabel="Nochmal versuchen">
                  <div data-panel={key}><Component /></div>
                </ErrorBoundary>
              </CompactRow>
            );
          })}
        </div>
        {panels.length === 0 && !isOn('momente') && (
          <p className="empty">Nichts gewählt. Unter Einstellungen → Programm → „Was dein Stream kann“ schaltest du Funktionen an.</p>
        )}
        {panels.length > 0 && shown.length === 0 && (
          <p className="empty">Für heute ist nichts gewählt. „Heute“ antippen und auswählen.</p>
        )}
      </div>
    );
  }

  return (
    <div className="stream-page">
      {(panels.length > 0 || isOn('momente')) && (
        <div className="stream-top">
          {panels.length > 0 && (
            <section className="stream-today" aria-labelledby="stream-today-title">
              <div className="stream-today-head">
                <h2 id="stream-today-title">Heute dabei</h2>
                <span>Bleibt so, bis du es änderst. Der Rest wartet hier.</span>
              </div>
              {chips}
            </section>
          )}
          {isOn('momente') && <MomentCard />}
        </div>
      )}
    <div className="stream-cards">
      {shown.map(({ key, scene }: { key: PanelKey; scene: SceneState }) => {
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
    </div>
      {panels.length === 0 && !isOn('momente') && (
        <p className="empty">Nichts gewählt. Unter Einstellungen → Programm → „Was dein Stream kann“ schaltest du Funktionen an.</p>
      )}
      {panels.length > 0 && shown.length === 0 && (
        <p className="empty">Für heute ist nichts gewählt. Tipp oben an, was du im Stream brauchst.</p>
      )}
    </div>
  );
}

const ASIDE_KEY = 'stream_set_aside';

function parseAside(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}
