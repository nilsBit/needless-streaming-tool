import React from 'react';

// Ready-made rewards to start from (design B, 08.10.), the same on the
// Punkte and the Kanalpunkte page. One click makes one; a template that
// needs a choice (which scene) opens the dialog filled in instead.

export type TemplateAction = 'roulette' | 'feature_request' | 'change_music' | 'scene' | 'alert';

export interface RewardTemplate {
  key: string;
  name: string;
  does: string;
  cost: number;
  action: TemplateAction;
  needsInput?: boolean;
  /** Shown only while this feature is on ("Was dein Stream kann"). */
  feature?: string;
}

export const REWARD_TEMPLATES: readonly RewardTemplate[] = [
  { key: 'rad', name: 'Glücksrad drehen', does: 'Das Rad wählt ein Thema für dich.', cost: 500, action: 'roulette', feature: 'rad' },
  { key: 'licht', name: 'Licht aus', does: 'Nur ein Alert – du reagierst im Stream.', cost: 300, action: 'alert' },
  { key: 'szene', name: 'Szene kurz wechseln', does: 'Wechselt für eine Weile auf eine Szene, die du wählst.', cost: 800, action: 'scene' },
  { key: 'idee', name: 'Idee einreichen', does: 'Der Zuschauer schreibt eine Idee dazu, sie erscheint im Alert.', cost: 1000, action: 'feature_request', needsInput: true },
  { key: 'musik', name: 'Musik wechseln', does: 'Ein Alert, du wechselst den Song.', cost: 400, action: 'change_music' },
];

interface Props {
  unit: string;
  /** Names that exist already, any case — their template shows "angelegt". */
  existing: string[];
  isOn: (feature: string) => boolean;
  disabled?: boolean;
  /** What a template whose name exists says: "angelegt", or "gibt es schon" where it may come from elsewhere. */
  madeLabel?: string;
  onUse: (template: RewardTemplate) => void;
}

export default function RewardTemplates({ unit, existing, isOn, disabled, madeLabel = 'angelegt', onUse }: Props) {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const shown = REWARD_TEMPLATES.filter((t) => !t.feature || isOn(t.feature));
  return (
    <section className="reward-templates" aria-labelledby="reward-templates-title">
      <div className="reward-templates-head">
        <h3 id="reward-templates-title">Mit einer Vorlage anfangen</h3>
        <span className="dialog-hint">Ein Klick füllt den Weg vor – du schaust drüber und legst an.</span>
      </div>
      <div className="reward-template-grid">
        {shown.map((t) => {
          const made = taken.has(t.name.toLowerCase());
          return (
            <div key={t.key} className="reward-template">
              <div className="reward-template-name">{t.name}</div>
              <div className="reward-template-does">{t.does}</div>
              <div className="reward-template-foot">
                <span className="reward-template-cost">{t.cost} <span>{unit}</span></span>
                {made
                  ? <span className="reward-template-made">{madeLabel}</span>
                  : <button type="button" className="card-secondary reward-template-use" onClick={() => onUse(t)} disabled={disabled}>Übernehmen</button>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
