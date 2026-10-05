import React from 'react';
import { apiPost } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';

export interface AppliedChange {
  id: string;
  overlay: string;
  state: string;
  at: string;
  label: string;
  kind: 'style' | 'variable';
}

export interface DraftStatus {
  overlay: string;
  state: string;
  receivedAt: string;
  applied: string[];
  pending: { key: string; label: string }[];
  wishes: string;
  done: boolean;
  needsScript?: string[];
}

export interface DesignStatus {
  applied: AppliedChange[];
  drafts: DraftStatus[];
}

/** The "Umsetzen" run (development only): a Claude Code run over what waits. */
export interface ImplementStatus {
  available: boolean;
  state: 'idle' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  notes?: string;
  done?: string[];
  baked?: number;
  needsScript?: { draft: string; items: string[] }[];
  reverted?: string[];
  kept?: string;
  error?: string;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const when = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * What came back from Figma. Colours, type, borders and the palette are
 * applied at once; the rest waits here until a Claude session implements it.
 */
export default function FigmaDrafts({ status, refetch, implement, refetchImplement }: {
  status: DesignStatus | null;
  refetch: () => void;
  implement: ImplementStatus | null;
  refetchImplement: () => void;
}) {
  const { toast } = useToast();
  const waiting = (status?.drafts ?? []).filter((d) => !d.done);
  const running = implement?.state === 'running';

  const startImplement = async () => {
    if (!(await apiPost('/dev/implement', {}))) toast.error('Umsetzen ließ sich nicht starten');
    refetchImplement();
  };

  // One change in Figma can be two declarations (weight and style); they go together.
  const groups = new Map<string, AppliedChange[]>();
  for (const change of status?.applied ?? []) {
    const key = `${change.overlay}/${change.state}/${change.label}`;
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }

  const act = async (changes: AppliedChange[], action: 'undo' | 'keep') => {
    for (const change of changes) {
      if (!(await apiPost(`/design/applied/${encodeURIComponent(change.id)}/${action}`, {}))) {
        toast.error(action === 'undo' ? 'Zurücknehmen fehlgeschlagen' : 'Behalten fehlgeschlagen');
        break;
      }
    }
    refetch();
  };

  const done = async (draft: DraftStatus) => {
    if (await apiPost(`/design/drafts/${encodeURIComponent(draft.overlay)}/${encodeURIComponent(draft.state)}/done`, {})) refetch();
    else toast.error('Aktion fehlgeschlagen');
  };

  return (
    <>
      <div className="ov2-section">
        <h3>Wartet auf Umsetzung</h3>
        <p className="ov2-section-desc">
          Was sich nicht eindeutig in CSS übersetzen lässt — Verschieben, Größen, neue oder entfernte Ebenen, deine Wünsche aus der Notiz.
        </p>
        {implement?.available && (
          <div className="figma-implement">
            <button className="ov2-small-btn figma-implement-btn" disabled={running || waiting.length === 0} onClick={startImplement}>
              {running ? 'Claude setzt um …' : 'Umsetzen lassen'}
            </button>
            <span className="ov2-section-desc">
              {running
                ? `läuft seit ${when(implement.startedAt ?? '')} — das Ergebnis erscheint hier und im Showcase.`
                : 'Startet Claude im Hintergrund an einer Kopie der Overlays: nur Markup und CSS, übernommen erst nach Prüfung. Nur in der Entwicklungsversion, nutzt dein Claude-Abo.'}
            </span>
          </div>
        )}
        {implement?.available && implement.state === 'done' && (
          <div className="figma-result">
            Fertig ({when(implement.finishedAt ?? '')}): {count(implement.done?.length ?? 0, 'Entwurf', 'Entwürfe')} erledigt,{' '}
            {count(implement.baked ?? 0, 'Änderung', 'Änderungen')} fest ins CSS übernommen.
            {implement.notes && <p className="figma-wishes">{implement.notes}</p>}
            {(implement.needsScript?.length ?? 0) > 0 && (
              <>
                <p className="figma-wishes">Liegen geblieben, weil sie eine Skriptänderung brauchen:</p>
                <ul className="figma-list">
                  {implement.needsScript!.flatMap((n, i) => n.items.map((item, j) => <li key={`${i}-${j}`}>{n.draft}: {item}</li>))}
                </ul>
              </>
            )}
          </div>
        )}
        {implement?.available && implement.state === 'failed' && (
          <div className="figma-result figma-result--failed">
            {implement.error}
            {(implement.reverted?.length ?? 0) > 0 && <ul className="figma-list">{implement.reverted!.map((f, i) => <li key={i}>abgelehnt: {f}</li>)}</ul>}
            {implement.kept && <p className="ov2-section-desc">Die Arbeitskopie des Laufs liegt zum Ansehen in {implement.kept}</p>}
          </div>
        )}
        {waiting.length === 0 ? (
          <p className="ov2-section-desc">Nichts offen.</p>
        ) : (
          <div className="ov2-card-list">
            {waiting.map((d) => (
              <div key={`${d.overlay}/${d.state}`} className="ov2-card figma-card">
                <div className="figma-card-body">
                  <span className="ov2-card-name">{d.overlay} / {d.state}</span>
                  <span className="ov2-card-url">gesendet {when(d.receivedAt)}</span>
                  {d.pending.length > 0 && <ul className="figma-list">{d.pending.map((p, i) => <li key={`${i}-${p.key}`}>{p.label}</li>)}</ul>}
                  {d.wishes && <p className="figma-wishes">Wünsche: {d.wishes}</p>}
                  {(d.needsScript?.length ?? 0) > 0 && (
                    <>
                      <p className="figma-wishes">Braucht eine Skriptänderung — für eine Claude-Sitzung:</p>
                      <ul className="figma-list">{d.needsScript!.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </>
                  )}
                </div>
                <button className="ov2-small-btn" onClick={() => done(d)} title="Aus der Liste nehmen — umgesetzt oder verworfen">Erledigt</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ov2-section">
        <h3>Aus Figma übernommen</h3>
        <p className="ov2-section-desc">
          Schon live. Änderungen an Elementen sind vorläufig: Beim nächsten Umsetzen wandern sie fest ins Overlay und verschwinden von hier.
          Palettenfarben sind Einstellungen — „Behalten“ nimmt sie von der Liste und lässt sie, wie sie sind.
        </p>
        {groups.size === 0 ? (
          <p className="ov2-section-desc">Noch nichts übernommen.</p>
        ) : (
          <div className="ov2-card-list">
            {[...groups.values()].map((changes) => (
              <div key={changes[0].id} className="ov2-card figma-card">
                <div className="figma-card-body">
                  <span className="ov2-card-name">{changes[0].label}</span>
                  <span className="ov2-card-url">{changes[0].overlay} / {changes[0].state} · {when(changes[0].at)}</span>
                </div>
                <div className="ov2-card-actions">
                  {changes[0].kind === 'variable' && <button className="ov2-small-btn" onClick={() => act(changes, 'keep')}>Behalten</button>}
                  <button className="ov2-small-btn" onClick={() => act(changes, 'undo')}>Zurücknehmen</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
