import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import StreamCard, { ChatCommands, type SceneState } from '../components/ux/StreamCard';
import { openAt } from '../components/ux/openAt';
import { useNavigate } from '../NavigationContext';
import { PANEL_REGISTRY } from '../panelRegistry';
import { PANEL_LABELS, findArea } from '../navigation';
import type { PanelKey } from '../panelKeys';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useFeatures } from '../contexts/FeaturesContext';
import { useCompact } from '../hooks/useCompact';
import CompactRow from '../components/compact/CompactRow';
import SceneHint from '../components/ux/SceneHint';

interface VisibleOverlays { scene: string | null; overlays: string[] }
interface OverlayScenes { connected: boolean; byOverlay: Record<string, string[]> }
interface CommandList { commands: Array<{ trigger: string; group: 'text' | 'lookup' | 'builtin'; id: string }> }

// One sentence per card, which overlay sources belong to it — the names are
// the overlay folders under src/overlays, as their OBS url carries them — and
// which built-ins chat uses for it, by key, with what follows the trigger.
const CARDS: Record<string, { sentence: string; overlays: string[]; commands?: Array<[string, string]> }> = {
  challenge: { sentence: 'Ein Satz, dazu läuft eine Uhr.', overlays: ['challenge'], commands: [['challenge', '']] },
  issues: { sentence: 'Du sammelst Themen, das Rad entscheidet.', overlays: ['roulette'], commands: [['issues', '']] },
  designs: { sentence: 'Du sammelst Vorschläge, der Chat stimmt ab.', overlays: ['poll'], commands: [['vote', ' <Nummer>']] },
  progress: { sentence: 'Woran du über mehrere Streams arbeitest und wie weit es ist.', overlays: ['progress'], commands: [['progress', '']] },
  song: { sentence: 'Zeigt im Stream nur den Titel, der gerade läuft.', overlays: ['song'], commands: [['song', '']] },
  world: { sentence: 'Die Karte im Stream zeigt den Eintrag, den du im Worldbuilder offen hast.', overlays: ['character'] },
};

/**
 * A card's commands as chat types them: the built-ins under their current
 * name, only those switched on; the world card gets every lookup.
 */
function commandsOf(key: string, list: CommandList | null): string[] {
  if (!list) return [];
  if (key === 'world') return list.commands.filter((c) => c.group === 'lookup').map((c) => `${c.trigger} <Name>`);
  return (CARDS[key]?.commands ?? []).flatMap(([id, rest]) => {
    const found = list.commands.find((c) => c.group === 'builtin' && c.id === id);
    return found ? [found.trigger + rest] : [];
  });
}

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
  const { data: commandList } = useApi<CommandList>('/commands');
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

  // 15.10.: "Heute dabei" is gone – every card whose feature is on shows. It
  // was a second choice on top of "Was dein Stream kann", and a goal card set
  // aside hid Pause/Beenden of a running reward timer.

  // Small window (12.10.): each card is a row with its main button;
  // "Moment merken" sits in the bar on top.
  const compact = useCompact();
  const [openRow, setOpenRow] = React.useState<PanelKey | null>(null);

  if (compact) {
    return (
      <div className="stream-page compact">
        {panels.length > 0 && <SceneHint />}
        <div className="compact-rows">
          {ordered.map(({ key, scene }) => {
            const Component = PANEL_REGISTRY[key];
            return (
              <CompactRow key={key} panel={key} title={PANEL_LABELS[key]} onScreen={scene?.state === 'on'} open={openRow === key} onToggle={() => setOpenRow(openRow === key ? null : key)}>
                <ErrorBoundary fallback={PANEL_LABELS[key]} errorTitle="Fehler" errorMessage="Etwas ist schiefgelaufen." retryLabel="Nochmal versuchen">
                  <ChatCommands commands={commandsOf(key, commandList)} />
                  <div data-panel={key}><Component /></div>
                </ErrorBoundary>
              </CompactRow>
            );
          })}
        </div>
        {panels.length === 0 && !isOn('momente') && (
          <p className="empty">Nichts gewählt. Unter Einstellungen → Programm → „Was dein Stream kann“ schaltest du Funktionen an.</p>
        )}
      </div>
    );
  }

  return (
    <div className="stream-page">
    <div className="stream-cards">
      {ordered.map(({ key, scene }: { key: PanelKey; scene: SceneState }) => {
        const Component = PANEL_REGISTRY[key];
        const card = CARDS[key] ?? { sentence: '', overlays: [] };
        const place = card.overlays[0] ? () => { go({ area: 'overlays', subTab: 'overlays' }); openAt('overlay', `${card.overlays[0]}:obs`); } : undefined;
        return (
          <StreamCard key={key} title={PANEL_LABELS[key]} sentence={card.sentence} commands={commandsOf(key, commandList)} scene={scene} onPlace={place}>
            <ErrorBoundary fallback={PANEL_LABELS[key]} errorTitle="Fehler" errorMessage="Etwas ist schiefgelaufen." retryLabel="Nochmal versuchen">
              <div data-panel={key}><Component /></div>
            </ErrorBoundary>
          </StreamCard>
        );
      })}
    </div>
      {panels.length === 0 && (
        <p className="empty">Nichts gewählt. Unter Einstellungen → Programm → „Was dein Stream kann“ schaltest du Funktionen an.</p>
      )}
    </div>
  );
}
