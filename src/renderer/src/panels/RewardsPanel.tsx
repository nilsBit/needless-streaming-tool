import React, { useEffect, useState } from 'react';
import { useFeatures } from '../contexts/FeaturesContext';
import { getActiveQuest } from '../components/quests/questStart';
import ChannelRewardsPanel from './ChannelRewardsPanel';
import PointsPanel from './PointsPanel';

type Mode = 'twitch' | 'points';

const MODE_KEY = 'nst.rewardsMode';
const QUEST_MODE: Record<string, Mode> = { channelReward: 'twitch', pointReward: 'points', pointTry: 'points', points10: 'points' };

function storedMode(): Mode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'twitch' || v === 'points' ? v : null;
  } catch { return null; }
}

// "Belohnungen" under Chat & Bot (13.10., Leinwand "A · Drei Reiter"): what
// viewers redeem, with Twitch channel points or the tool's own points — one
// switch instead of two tabs. Both stay mounted so a quest started for
// either finds its path; the one not chosen is only hidden.
export default function RewardsPanel() {
  const { isOn } = useFeatures();
  const both = isOn('belohnungen') && isOn('punkte');
  const only: Mode = isOn('belohnungen') ? 'twitch' : 'points';
  const [mode, setMode] = useState<Mode>(() => QUEST_MODE[getActiveQuest() ?? ''] ?? storedMode() ?? 'twitch');
  const shown: Mode = both ? mode : only;

  // A quest started while the page is open switches to where it is done.
  useEffect(() => {
    const on = (e: Event) => {
      const m = QUEST_MODE[(e as CustomEvent<string>).detail];
      if (m) setMode(m);
    };
    window.addEventListener('nst-quest-path', on);
    window.addEventListener('nst-quest-spot', on);
    return () => {
      window.removeEventListener('nst-quest-path', on);
      window.removeEventListener('nst-quest-spot', on);
    };
  }, []);

  const pick = (m: Mode) => {
    setMode(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* remembered until reload */ }
  };

  return (
    <div className="rewards-switch-page">
      {both && (
        <div className="segmented" role="radiogroup" aria-label="Welche Punkte">
          <button type="button" role="radio" aria-checked={shown === 'twitch'} onClick={() => pick('twitch')}>Kanalpunkte von Twitch</button>
          <button type="button" role="radio" aria-checked={shown === 'points'} onClick={() => pick('points')}>Eigene Punkte</button>
        </div>
      )}
      <p className="chat-sentence">{shown === 'twitch' ? 'Zuschauer lösen sie unter dem Chat ein. Das Tool führt die Aktion aus.' : 'Punkte, die nur dein Stream vergibt. Eingelöst wird mit !einlösen.'}</p>
      {isOn('belohnungen') && <div hidden={shown !== 'twitch'}><ChannelRewardsPanel /></div>}
      {isOn('punkte') && <div hidden={shown !== 'points'}><PointsPanel /></div>}
    </div>
  );
}
