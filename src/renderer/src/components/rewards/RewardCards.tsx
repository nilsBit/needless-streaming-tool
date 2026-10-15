import React from 'react';
import { BLOCKS, type Block } from './rewardBlocks';

// The rewards as tiles (Leinwand "B · Karten – wie die Vorlagen", 15.10.):
// the block's icon, price, name and one line of what it does. Tiles from the
// tool stand out in the accent; those from the Creator Dashboard stay grey.
// The last tile makes a new one.

export interface RewardCard {
  key: string | number;
  name: string;
  cost: string;
  block: Block | null;
  /** "Timer · 5 Min", "Alert · Creator-Dashboard". */
  detail: string;
  /** Made in the Creator Dashboard – only to look at. */
  foreign?: boolean;
  enabled: boolean;
  onOpen: () => void;
}

const SHORT: Record<Block, string> = { alert: 'Alert', roulette: 'Glücksrad', scene: 'Szene', timer: 'Timer', sound: 'Ton' };
const ICON = Object.fromEntries(BLOCKS.map((b) => [b.value, b.icon])) as Record<Block, string>;

export function blockName(block: Block): string {
  return SHORT[block];
}

/** The line under a reward made in the tool: the block and what is set in it. */
export function blockDetail(r: { action: Block; scene_name: string | null; scene_seconds: number | null; minutes: number | null; sound: string | null; withText: boolean; cooldown?: number }): string {
  const parts = [SHORT[r.action]];
  if (r.action === 'scene' && r.scene_name) parts.push(`„${r.scene_name}“${r.scene_seconds ? `, ${r.scene_seconds} s` : ''}`);
  if (r.action === 'timer' && r.minutes) parts.push(`${r.minutes} Min`);
  if (r.action === 'sound' && r.sound) parts.push(r.sound.replace(/\.[a-z0-9]+$/i, ''));
  if (r.withText) parts.push('mit Text');
  if (r.cooldown) parts.push(`Sperre ${r.cooldown} s`);
  return parts.join(' · ');
}

export default function RewardCards({ cards, onNew, newDisabled }: { cards: RewardCard[]; onNew: () => void; newDisabled?: boolean }) {
  return (
    <ul className="reward-cards" aria-label="Belohnungen">
      {cards.map((c) => (
        <li key={c.key}>
          <button type="button" className={`reward-card${c.foreign ? ' foreign' : ''}${c.enabled ? '' : ' off'}`} onClick={c.onOpen}>
            <span className="reward-card-top">
              <span className="reward-card-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[c.block ?? 'alert']} /></svg>
              </span>
              <span className="reward-card-cost">{c.cost}</span>
            </span>
            <span className="reward-card-name">{c.name}</span>
            <span className="reward-card-detail">{c.detail}{c.enabled ? '' : ' · aus'}</span>
          </button>
        </li>
      ))}
      <li>
        <button type="button" className="reward-card reward-card-new" onClick={onNew} disabled={newDisabled}>
          <span className="reward-card-name">+ Neue Belohnung</span>
          <span className="reward-card-detail">Aus einer Vorlage oder selbst</span>
        </button>
      </li>
    </ul>
  );
}
