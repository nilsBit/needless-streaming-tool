import React, { useState } from 'react';
import { apiFetch, useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import QuestPath, { ChoiceCards, PathDone } from '../QuestPath';
import { useQuests } from '../useQuests';
import { useNavigate } from '../../../NavigationContext';

// Bringing an overlay into OBS as a Quest-Pfad (spec 2026-10-08-quests-design):
// Overlay · Szene · Prüfen · Geschafft. The tool makes the browser source in
// the chosen scene at the overlay's size; one that sits there already is said
// so, not made twice.

interface Entry { name: string; label: string; sentence: string; builtin: boolean; size: { width: number; height: number } | null }
interface Scenes { scenes: string[]; current: string | null }
interface PlaceResult { status: 'created' | 'exists' | 'no-scene'; scene: string }

interface Props {
  /** The overlays that may be offered (built in, of features that are on). */
  overlays: Entry[];
  /** Start with this overlay chosen. */
  initial?: string;
  onClose: () => void;
  onPlaced: () => void;
}

export default function OverlayQuestPath({ overlays, initial, onClose, onPlaced }: Props) {
  const { toast } = useToast();
  const go = useNavigate();
  const { quests } = useQuests();
  const { data: obs } = useApi<{ connected: boolean }>('/obs/status');
  const { data: sceneData } = useApi<Scenes>('/obs/scenes');
  const offer = overlays.filter((o) => o.builtin);
  const [overlay, setOverlay] = useState(initial ?? offer[0]?.name ?? '');
  const [scene, setScene] = useState('');
  const [result, setResult] = useState<PlaceResult | null>(null);
  const chosen = offer.find((o) => o.name === overlay);
  const scenes = sceneData?.scenes ?? [];
  const quest = quests?.open.find((q) => q.key === 'overlay') ?? null;
  const pickedScene = scene || sceneData?.current || '';

  const place = async (): Promise<boolean> => {
    const res = await apiFetch('/obs/place-overlay', { method: 'POST', body: JSON.stringify({ overlay, scene: pickedScene }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(res.status === 503 ? 'OBS ist nicht verbunden.' : body.error ?? 'Nicht angelegt'); return false; }
    setResult(body);
    onPlaced();
    return true;
  };

  return (
    <QuestPath
      title="Overlay ins Bild bringen"
      sentence="Das Tool legt die Browserquelle in OBS an – du wählst nur, was und wo."
      startAt={initial ? 1 : 0}
      finishLabel="In OBS anlegen"
      onFinish={place}
      onClose={onClose}
      steps={[
        {
          label: 'Overlay',
          ready: !!chosen,
          content: (
            <>
              <h3 className="quest-step-title">Was soll ins Bild?</h3>
              <ChoiceCards label="Overlay" value={overlay} onChange={setOverlay} options={offer.map((o) => ({ value: o.name, title: o.label, text: o.sentence }))} />
            </>
          ),
        },
        {
          label: 'Szene',
          ready: !!obs?.connected && !!pickedScene,
          content: (
            <>
              <h3 className="quest-step-title">In welche Szene?</h3>
              {!obs?.connected && (
                <div className="reward-banner" role="alert">
                  <span>OBS ist nicht verbunden. Verbinde es, dann geht es hier weiter.</span>
                  <button type="button" className="card-primary" onClick={() => { onClose(); go({ area: 'settings', subTab: 'verbindungen' }); }}>Zu den Verbindungen</button>
                </div>
              )}
              {obs?.connected && scenes.length === 0 && <p className="dialog-empty">In OBS gibt es noch keine Szene.</p>}
              <ChoiceCards label="Szene" value={pickedScene} onChange={setScene} options={scenes.map((s) => ({ value: s, title: s, text: s === sceneData?.current ? 'Gerade im Bild' : 'Szene in OBS' }))} />
            </>
          ),
        },
        {
          label: 'Prüfen',
          content: (
            <>
              <h3 className="quest-step-title">Alles richtig?</h3>
              <div className="quest-preview-chat">
                <strong>{chosen?.label}</strong> kommt in die Szene <strong>{pickedScene}</strong>{chosen?.size ? `, ${chosen.size.width} × ${chosen.size.height}` : ''}.
              </div>
              <p className="dialog-hint" style={{ margin: 0 }}>Liegt es schon in einer Szene, legt das Tool es nicht noch einmal an und sagt dir, wo es liegt. Verschieben und Größe ändern machst du danach in OBS.</p>
            </>
          ),
        },
      ]}
      done={
        <PathDone
          title={result?.status === 'exists' ? `${chosen?.label} lag schon in „${result.scene}“` : `${chosen?.label} ist im Bild!`}
          xp={quest ? quest.xp : null}
          text={`Schau in OBS in die Szene „${result?.scene ?? pickedScene}“ – dort sitzt die Browserquelle. Unter „Im Stream“ siehst du, ob sie gerade zu sehen ist.`}
        />
      }
    />
  );
}
