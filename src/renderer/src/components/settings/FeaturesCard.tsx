import React, { useState } from 'react';
import { useFeatures } from '../../contexts/FeaturesContext';
import { useToast } from '../../contexts/ToastContext';
import { CONNECTION_LABELS, FEATURE_GROUPS, FEATURES, PERSONAL_FEATURES, type FeatureKey } from '../../../../shared/features';
import SearchField, { matchesSearch } from '../ux/SearchField';

// Einstellungen → Programm: what the stream can do, switched on and off right
// here (Nils, 08.10.: no detour through the setup, no dialog). The groups and
// sentences are the setup's; a click saves. Off is hidden, never gone. The
// whole setup, with connecting and OBS, stays one link away.
export default function FeaturesCard() {
  const { toast } = useToast();
  const { features, worldbuilder, save, openSetup } = useFeatures();
  const [saving, setSaving] = useState<FeatureKey | null>(null);
  const [search, setSearch] = useState('');
  const groups = FEATURE_GROUPS.filter((g) => worldbuilder || !g.personal);
  const available = FEATURES.filter((f) => worldbuilder || !PERSONAL_FEATURES.includes(f.key));
  const onCount = available.filter((f) => features.has(f.key)).length;
  const found = (f: (typeof FEATURES)[number]) => matchesSearch(search, f.label, f.sentence, FEATURE_GROUPS.find((g) => g.key === f.group)?.label, ...f.needs.map((n) => CONNECTION_LABELS[n]));
  const shownGroups = groups.map((g) => ({ group: g, items: FEATURES.filter((f) => f.group === g.key && found(f)) })).filter((g) => g.items.length > 0);

  const set = async (key: FeatureKey, on: boolean) => {
    if (features.has(key) === on) return;
    const next = available.map((f) => f.key).filter((k) => (k === key ? on : features.has(k)));
    setSaving(key);
    const ok = await save(next);
    setSaving(null);
    if (!ok) toast.error('Nicht gespeichert');
  };

  return (
    <div className="s-card" data-card="features">
      <div className="s-card-header">
        <div className="s-card-info">
          <div>
            <div className="s-card-title">Was dein Stream kann</div>
            <div className="s-card-status" style={{ color: '#888' }}>
              {onCount} von {available.length} an. Die App zeigt nur, was an ist – Ausgeschaltetes ist ausgeblendet, nicht gelöscht.
            </div>
          </div>
        </div>
        <SearchField value={search} onChange={setSearch} label="Funktionen suchen" />
      </div>
      <div className="s-card-body feat-groups">
        {shownGroups.length === 0 && <p className="dialog-empty feat-setup">Keine Funktion passt zu „{search.trim()}“.</p>}
        {shownGroups.map(({ group: g, items }) => (
          <section key={g.key} className="feat-group" aria-label={g.label}>
            <div className="feat-group-head">
              <h3>{g.label}</h3>
              <p>{g.sentence}</p>
            </div>
            {items.map((f) => {
              const on = features.has(f.key);
              return (
                <div key={f.key} className={`feat-row ${on ? 'on' : ''}`} data-feature={f.key}>
                  <div className="feat-text">
                    <div className="feat-name">{f.label}</div>
                    <div className="feat-sentence">{f.sentence}{f.needs.length ? <span className="feat-needs"> · braucht {f.needs.map((n) => CONNECTION_LABELS[n]).join(', ')}</span> : null}</div>
                  </div>
                  <div className="s-toggle-row compact" role="group" aria-label={f.label}>
                    <button type="button" className={`s-toggle-btn ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => set(f.key, true)} disabled={saving !== null}>An</button>
                    <button type="button" className={`s-toggle-btn ${!on ? 'active' : ''}`} aria-pressed={!on} onClick={() => set(f.key, false)} disabled={saving !== null}>Aus</button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        <p className="dialog-hint feat-setup">
          Braucht etwas Neues eine Verbindung oder Browserquellen in OBS? <button type="button" className="card-link" onClick={openSetup}>Einrichtung noch einmal durchgehen</button>
        </p>
      </div>
    </div>
  );
}
