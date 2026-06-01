import React, { useState, useEffect, useMemo } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingWizard from './components/OnboardingWizard';
import { apiFetch, getApiToken } from './hooks/useApi';
import { useToast } from './i18n/ToastContext';
import { useDashboardLayout } from './hooks/useDashboardLayout';
import { useTranslation } from './i18n/LanguageContext';
import type { TranslationKey } from './i18n/translations';
import ChallengePanel from './panels/ChallengePanel';
import IssuesPanel from './panels/IssuesPanel';
import ProgressPanel from './panels/ProgressPanel';
import DesignsPanel from './panels/DesignsPanel';
import ClipsPanel from './panels/ClipsPanel';
import MilestonesPanel from './panels/MilestonesPanel';
import SettingsPanel from './panels/SettingsPanel';
import OverlaysPanel from './panels/OverlaysPanel';
import HelpPanel from './panels/HelpPanel';
import SongPanel from './panels/SongPanel';
import StatsPanel from './panels/StatsPanel';
import RewardStatsPanel from './panels/RewardStatsPanel';
import ObsPanel from './panels/ObsPanel';
import logoSvg from './assets/logo.svg';

interface UpdateInfo { version: string; url: string }

const TABS = {
  dashboard: {
    icon: '🎮',
    labelKey: 'tab.dashboard',
    panels: [
      { key: 'challenge', labelKey: 'panel.challenge', component: ChallengePanel },
      { key: 'issues', labelKey: 'panel.issues', component: IssuesPanel },
      { key: 'clips', labelKey: 'panel.clips', component: ClipsPanel },
      { key: 'designs', labelKey: 'panel.designs', component: DesignsPanel },
      { key: 'song', labelKey: 'panel.song', component: SongPanel },
      { key: 'rewardstats', labelKey: 'panel.rewardstats', component: RewardStatsPanel },
      { key: 'obs', labelKey: 'panel.obs', component: ObsPanel },
    ],
  },
  projekt: {
    icon: '📋',
    labelKey: 'tab.project',
    panels: [
      { key: 'progress', labelKey: 'panel.progress', component: ProgressPanel },
      { key: 'milestones', labelKey: 'panel.milestones', component: MilestonesPanel },
    ],
  },
  settings: {
    icon: '⚙️',
    labelKey: 'tab.settings',
    panels: [
      { key: 'settings', labelKey: 'panel.settings', component: SettingsPanel },
      { key: 'overlays', labelKey: 'panel.overlays', component: OverlaysPanel },
      { key: 'stats', labelKey: 'panel.stats', component: StatsPanel },
    ],
  },
  help: {
    icon: '📖',
    labelKey: 'tab.help',
    panels: [
      { key: 'help', labelKey: 'panel.help', component: HelpPanel },
    ],
  },
} as const;

type TabKey = keyof typeof TABS;

export default function App() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  // Get default panel keys for active tab
  const defaultPanelKeys = useMemo(() =>
    TABS[activeTab].panels.map(p => p.key),
    [activeTab]
  );
  const layout = useDashboardLayout(activeTab, defaultPanelKeys);

  // Drag state
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  useEffect(() => {
    let retries = 0;
    function checkOnboarding() {
      const token = getApiToken();
      if (!token) {
        if (retries++ < 20) {
          setTimeout(checkOnboarding, 500);
        } else {
          setShowOnboarding(false);
        }
        return;
      }
      apiFetch('/settings/onboarding')
        .then((r) => r.json())
        .then((data) => setShowOnboarding(!data.completed))
        .catch(() => setShowOnboarding(false));
    }
    checkOnboarding();
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable) return;
    const handler = (data: UpdateInfo) => {
      toast.errorAction({
        message: `${t('update.available')}: v${data.version}`,
        action: {
          label: t('update.download'),
          onClick: () => window.open(data.url, '_blank'),
        },
      });
    };
    api.onUpdateAvailable(handler);
  }, []);

  const tab = TABS[activeTab];

  const panelMap = useMemo(() => {
    const map = new Map<string, { key: string; labelKey: TranslationKey; component: React.ComponentType }>();
    for (const p of tab.panels) {
      map.set(p.key, p);
    }
    return map;
  }, [tab]);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
    setDragKey(key);
  };

  const handleDragEnd = () => {
    setDragKey(null);
    setDragOverKey(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (key: string) => {
    if (dragKey && dragKey !== key) setDragOverKey(key);
  };

  const handleDrop = (targetKey: string, e: React.DragEvent) => {
    e.preventDefault();
    const fromKey = e.dataTransfer.getData('text/plain');
    if (fromKey && fromKey !== targetKey) layout.reorder(fromKey, targetKey);
    setDragKey(null);
    setDragOverKey(null);
  };

  if (showOnboarding === null) return null; // Loading
  if (showOnboarding) return <ErrorBoundary><OnboardingWizard onComplete={() => setShowOnboarding(false)} /></ErrorBoundary>;

  const renderHeroPanel = () => {
    const p = panelMap.get(layout.hero);
    if (!p) return null;
    const Component = p.component;
    return (
      <div className="hero-panel" data-panel={layout.hero}>
        <div className="panel-header-bar">
          <span className="hero-badge">FOKUS</span>
          <span className="collapse-label">{t(p.labelKey)}</span>
          <div className="panel-header-controls">
            <button
              className="panel-header-btn"
              onClick={() => layout.hide(layout.hero)}
              title={t('layout.hide')}
            >
              👁
            </button>
          </div>
        </div>
        <ErrorBoundary
          fallback={t(p.labelKey)}
          errorTitle={t('error.title')}
          errorMessage={t('error.message')}
          retryLabel={t('error.retry')}
        >
          <Component />
        </ErrorBoundary>
      </div>
    );
  };

  const renderDashboardPanel = (key: string, isCollapsed: boolean) => {
    const p = panelMap.get(key);
    if (!p) return null;
    const Component = p.component;
    return (
      <div
        key={key}
        data-panel={key}
        className={`panel-wrapper ${isCollapsed ? 'collapsed' : ''} ${dragKey === key ? 'dragging' : ''} ${dragOverKey === key ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={() => handleDragEnter(key)}
        onDrop={(e) => handleDrop(key, e)}
      >
        <div className="panel-header-bar">
          <span
            className="drag-handle"
            draggable
            onDragStart={(e) => handleDragStart(e, key)}
            onDragEnd={handleDragEnd}
          >
            ⠿
          </span>
          <button className="panel-collapse-btn" onClick={() => layout.toggleCollapsed(key)}>
            <span className="collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
            <span className="collapse-label">{t(p.labelKey)}</span>
          </button>
          <div className="panel-header-controls">
            <button
              className="pin-btn"
              onClick={() => layout.pinAsHero(key)}
              title={t('layout.pin_as_focus')}
            >
              📌
            </button>
            <button
              className="panel-header-btn"
              onClick={() => layout.hide(key)}
              title={t('layout.hide')}
            >
              👁
            </button>
          </div>
        </div>
        {!isCollapsed && (
          <ErrorBoundary
            fallback={t(p.labelKey)}
            errorTitle={t('error.title')}
            errorMessage={t('error.message')}
            retryLabel={t('error.retry')}
          >
            <Component />
          </ErrorBoundary>
        )}
      </div>
    );
  };

  const renderPanel = (key: string) => {
    const p = panelMap.get(key);
    if (!p) return null;
    const Component = p.component;
    return (
      <div
        key={key}
        data-panel={key}
        className={`panel-wrapper ${dragKey === key ? 'dragging' : ''} ${dragOverKey === key ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={() => handleDragEnter(key)}
        onDrop={(e) => handleDrop(key, e)}
      >
        <div className="panel-header-bar">
          <span
            className="drag-handle"
            draggable
            onDragStart={(e) => handleDragStart(e, key)}
            onDragEnd={handleDragEnd}
          >
            ⠿
          </span>
          <span className="collapse-label">{t(p.labelKey)}</span>
          <div className="panel-header-controls">
            <button
              className="panel-header-btn"
              onClick={() => layout.hide(key)}
              title={t('layout.hide')}
            >
              👁
            </button>
          </div>
        </div>
        <ErrorBoundary
          fallback={t(p.labelKey)}
          errorTitle={t('error.title')}
          errorMessage={t('error.message')}
          retryLabel={t('error.retry')}
        >
          <Component />
        </ErrorBoundary>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <img src={logoSvg} alt="NST" className="app-logo" />
        <nav className="tab-nav">
          {(Object.entries(TABS) as Array<[TabKey, typeof TABS[TabKey]]>).map(([key, tabDef]) => (
            <button
              key={key}
              className={`tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {tabDef.icon} {t(tabDef.labelKey)}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === 'dashboard' ? (
        <div className="dashboard-hero-layout">
          {renderHeroPanel()}
          {layout.openOrder.length > 0 && (
            <div className="panel-grid">
              {layout.openOrder.map((key) => renderDashboardPanel(key, false))}
            </div>
          )}
          {layout.collapsedOrder.length > 0 && (
            <div className="panel-collapsed-list">
              {layout.collapsedOrder.map((key) => renderDashboardPanel(key, true))}
            </div>
          )}
        </div>
      ) : (
        <main className="panels single-column">
          {layout.order.map((key) => renderPanel(key))}
        </main>
      )}

      {/* Hidden panels bar */}
      {layout.hidden.length > 0 && (
        <div className="hidden-bar">
          <span className="hidden-bar-label">{t('layout.hidden_panels')}:</span>
          {layout.hidden.map((key) => {
            const p = panelMap.get(key);
            return p ? (
              <button key={key} className="hidden-bar-btn" onClick={() => layout.show(key)}>
                {t(p.labelKey)}
              </button>
            ) : null;
          })}
          <button className="hidden-bar-btn" onClick={layout.reset} title={t('layout.reset')}>
            ↩️ {t('layout.reset')}
          </button>
        </div>
      )}
    </div>
  );
}
