import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { OVERLAY_OF_OLD_TAB, visibleNavigation, type Area, type AreaKey } from './navigation';
import { openAt } from './components/ux/openAt';
import { NavigationProvider, type NavTarget } from './NavigationContext';
import { useFeatures } from './contexts/FeaturesContext';
import PageHeader from './components/ux/PageHeader';
import SubTabs from './components/ux/SubTabs';
import ConnectionMarks from './components/ux/ConnectionMarks';
import ReadinessBanner from './components/ux/ReadinessBanner';
import AreaPage from './pages/AreaPage';
import StreamPage from './pages/StreamPage';
import SetupPage from './pages/SetupPage';
import SceneHint from './components/ux/SceneHint';
import StageBadge from './components/quests/StageBadge';
import QuestTracker from './components/quests/QuestTracker';
import QuestCoach from './components/quests/QuestCoach';
import QuestCelebrations from './components/quests/QuestCelebrations';
import logoSvg from './assets/logo.svg';

// Sidebar with the areas and the connection marks, then the page: header,
// sub tabs, panels. The last open area and sub tab are remembered in
// localStorage. The app opens on "Im Stream"; what is missing before going
// live shows up there as a banner, not on a page of its own. On first start
// the setup takes the whole window instead (06.10.); the areas and sub tabs
// shown follow the features it chose.

const STORAGE_KEY = 'nst.navigation';
// Left behind by the old shell ("Live / Produktion" and the dashboard board).
const LEGACY_KEYS = ['stream_area', 'dashboard-layout'];

interface NavState {
  area: AreaKey;
  subTab: string | null;
}

function loadNav(): NavState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NavState>;
      return {
        area: (parsed.area ?? 'stream') as AreaKey,
        subTab: typeof parsed.subTab === 'string' ? parsed.subTab : null,
      };
    }
  } catch { /* ignore */ }
  return { area: 'stream', subTab: null };
}

export default function Shell() {
  const [nav, setNav] = useState<NavState>(loadNav);
  const { loaded, done, features, setupOpen } = useFeatures();
  const areas = useMemo(() => visibleNavigation(features), [features]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nav));
      for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    } catch { /* ignore */ }
  }, [nav]);

  // A stored place that the choice hid falls back to what is there.
  const area: Area = areas.find((a) => a.key === nav.area) ?? areas[0];
  const subTab = area.subTabs.find((t) => t.key === nav.subTab) ?? area.subTabs[0];
  const hasTabRow = area.subTabs.length > 1;

  const go = useCallback((target: NavTarget) => {
    // An old sub tab of Overlays & Alerts opens the workshop it became.
    const overlay = target.area === 'overlays' && target.subTab ? OVERLAY_OF_OLD_TAB[target.subTab] : undefined;
    if (overlay) {
      setNav({ area: 'overlays', subTab: 'overlays' });
      openAt('overlay', overlay);
      return;
    }
    setNav({ area: target.area, subTab: target.subTab ?? null });
  }, []);
  const goSubTab = (key: string) => setNav({ area: area.key, subTab: key });

  if (loaded && (!done || setupOpen)) return <SetupPage />;

  const renderNavButton = (key: AreaKey, label: string, secondary: boolean) => {
    const active = key === area.key;
    return (
      <button
        key={key}
        type="button"
        className={`shell-nav-btn ${active ? 'active' : ''} ${secondary ? 'secondary' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => go({ area: key })}
      >
        {label}
      </button>
    );
  };

  return (
    <NavigationProvider value={go}>
      <div className="shell">
        <nav className="shell-nav" aria-label="Bereiche">
          <img src={logoSvg} alt="NST" className="shell-logo" />
          <StageBadge />
          {areas.filter((a) => a.group === 'main').map((a) => renderNavButton(a.key, a.label, false))}
          <div className="shell-nav-divider" role="separator" />
          {areas.filter((a) => a.group === 'secondary').map((a) => renderNavButton(a.key, a.label, true))}
          <QuestTracker area={area.key} subTab={subTab.key} />
          <ConnectionMarks />
        </nav>
        <div className="shell-page">
          <PageHeader title={area.label} sentence={area.sentence} aside={area.key === 'stream' ? <SceneHint /> : undefined} />
          {hasTabRow && <SubTabs tabs={area.subTabs} active={subTab.key} onSelect={goSubTab} />}
          <main className="shell-main">
            {area.key === 'stream' && <ReadinessBanner />}
            {area.key === 'stream'
              ? <StreamPage />
              : <AreaPage subTab={subTab} showSentence={hasTabRow} />}
          </main>
        </div>
      </div>
      <QuestCoach />
      <QuestCelebrations />
    </NavigationProvider>
  );
}
