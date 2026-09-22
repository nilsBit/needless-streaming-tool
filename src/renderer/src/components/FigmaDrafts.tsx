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
}

export interface DesignStatus {
  applied: AppliedChange[];
  drafts: DraftStatus[];
}

const when = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * What came back from Figma. Colours, type, borders and the palette are
 * applied at once; the rest waits here until a Claude session implements it.
 */
export default function FigmaDrafts({ status, refetch }: { status: DesignStatus | null; refetch: () => void }) {
  const { toast } = useToast();
  const waiting = (status?.drafts ?? []).filter((d) => !d.done);

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
          Die nächste Claude-Sitzung arbeitet diese Liste zuerst ab.
        </p>
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
