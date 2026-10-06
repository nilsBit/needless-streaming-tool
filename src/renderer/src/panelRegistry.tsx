import React from 'react';
import type { PanelKey } from './panelKeys';
import ChallengePanel from './panels/ChallengePanel';
import IssuesPanel from './panels/IssuesPanel';
import DesignsPanel from './panels/DesignsPanel';
import ProgressPanel from './panels/ProgressPanel';
import SongPanel from './panels/SongPanel';
import WorldPanel from './panels/WorldPanel';
import TextCommandsPanel from './panels/TextCommandsPanel';
import ChatBotSettings from './components/settings/ChatBotSettings';
import TryCommandsPanel from './panels/TryCommandsPanel';
import OverlaysPanel from './panels/OverlaysPanel';
import AlertSettings from './components/AlertSettings';
import MilestonesPanel from './panels/MilestonesPanel';
import ObsPanel from './panels/ObsPanel';
import ClipsPanel from './panels/ClipsPanel';
import AutoClipsSettings from './components/settings/AutoClipsSettings';
import StatsPanel from './panels/StatsPanel';
import RewardStatsPanel from './panels/RewardStatsPanel';
import SettingsPanel from './panels/SettingsPanel';
import HotkeysPanel from './panels/HotkeysPanel';
import HelpPanel from './panels/HelpPanel';

// Panel key → component. Where a panel lives is navigation.ts's business;
// this file only knows how to render each one.
const SettingsConnections = () => <SettingsPanel category="connections" />;
const SettingsApp = () => <SettingsPanel category="app" />;
const SettingsData = () => <SettingsPanel category="data" />;

export const PANEL_REGISTRY: Record<PanelKey, React.ComponentType> = {
  challenge: ChallengePanel,
  issues: IssuesPanel,
  designs: DesignsPanel,
  progress: ProgressPanel,
  song: SongPanel,
  world: WorldPanel,
  textcommands: TextCommandsPanel,
  chatbot: ChatBotSettings,
  trycommands: TryCommandsPanel,
  overlays: OverlaysPanel,
  alerts: AlertSettings,
  milestones: MilestonesPanel,
  obs: ObsPanel,
  clips: ClipsPanel,
  autoclips: AutoClipsSettings,
  stats: StatsPanel,
  rewardstats: RewardStatsPanel,
  'settings-connections': SettingsConnections,
  'settings-app': SettingsApp,
  hotkeys: HotkeysPanel,
  'settings-data': SettingsData,
  help: HelpPanel,
};
