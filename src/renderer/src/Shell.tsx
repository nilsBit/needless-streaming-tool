import React, { useState, useEffect, useCallback } from 'react';
import { AREAS, findArea, findSubTab, type AreaKey } from './navigation';
import { NavigationProvider, type NavTarget } from './NavigationContext';
import PageHeader from './components/ux/PageHeader';
import SubTabs from './components/ux/SubTabs';
import ConnectionMarks from './components/ux/ConnectionMarks';
import ReadinessBanner from './components/ux/ReadinessBanner';
import AreaPage from './pages/AreaPage';
import logoSvg from './assets/logo.svg';

// Sidebar with the areas and the connection marks, then the page: header,
// sub tabs, panels. The last open area and sub tab are remembered in
// localStorage. The app opens on "Im Stream"; what is missing before going
// live shows up there as a banner, not on a page of its own.

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
        area: findArea(parsed.area).key,
        subTab: typeof parsed.subTab === 'string' ? parsed.subTab : null,
      };
    }
  } catch { /* ignore */ }
  return { area: 'stream', subTab: null };
}

export default function Shell() {
  const [nav, setNav] = useState<NavState>(loadNav);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nav));
      for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    } catch { /* ignore */ }
  }, [nav]);

  const area = findArea(nav.area);
  const subTab = findSubTab(area, nav.subTab);
  const hasTabRow = area.subTabs.length > 1;

  const go = useCallback((target: NavTarget) => {
    setNav({ area: findArea(target.area).key, subTab: target.subTab ?? null });
  }, []);
  const goSubTab = (key: string) => setNav({ area: area.key, subTab: key });

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
          {AREAS.filter((a) => a.group === 'main').map((a) => renderNavButton(a.key, a.label, false))}
          <div className="shell-nav-divider" role="separator" />
          {AREAS.filter((a) => a.group === 'secondary').map((a) => renderNavButton(a.key, a.label, true))}
          <ConnectionMarks />
        </nav>
        <div className="shell-page">
          <PageHeader title={area.label} sentence={area.sentence} />
          {hasTabRow && <SubTabs tabs={area.subTabs} active={subTab.key} onSelect={goSubTab} />}
          <main className="shell-main">
            {area.key === 'stream' && <ReadinessBanner />}
            <AreaPage subTab={subTab} showSentence={hasTabRow} />
          </main>
        </div>
      </div>
    </NavigationProvider>
  );
}
