import React, { useState, useEffect } from 'react';
import { AREAS, findArea, findSubTab, type AreaKey } from './navigation';
import PageHeader from './components/ux/PageHeader';
import SubTabs from './components/ux/SubTabs';
import AreaPage from './pages/AreaPage';
import StartPage from './pages/StartPage';
import logoSvg from './assets/logo.svg';

// Sidebar with the areas, then the page: header, sub tabs, panels.
// The last open area and sub tab are remembered in localStorage.

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
  return { area: 'start', subTab: null };
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

  const goArea = (key: AreaKey) => setNav({ area: key, subTab: null });
  const goSubTab = (key: string) => setNav({ area: area.key, subTab: key });

  const renderNavButton = (key: AreaKey, label: string, secondary: boolean) => {
    const active = key === area.key;
    return (
      <button
        key={key}
        type="button"
        className={`shell-nav-btn ${active ? 'active' : ''} ${secondary ? 'secondary' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => goArea(key)}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Bereiche">
        <img src={logoSvg} alt="NST" className="shell-logo" />
        {AREAS.filter((a) => a.group === 'main').map((a) => renderNavButton(a.key, a.label, false))}
        <div className="shell-nav-divider" role="separator" />
        {AREAS.filter((a) => a.group === 'secondary').map((a) => renderNavButton(a.key, a.label, true))}
      </nav>
      <div className="shell-page">
        <PageHeader title={area.label} sentence={area.sentence} />
        {hasTabRow && <SubTabs tabs={area.subTabs} active={subTab.key} onSelect={goSubTab} />}
        <main className="shell-main">
          {area.key === 'start'
            ? <StartPage onNavigate={goArea} />
            : <AreaPage subTab={subTab} showSentence={hasTabRow} />}
        </main>
      </div>
    </div>
  );
}
