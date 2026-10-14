import React from 'react';
import type { PanelKey } from './panelKeys';
import ChallengePanel from './panels/ChallengePanel';
import IssuesPanel from './panels/IssuesPanel';
import DesignsPanel from './panels/DesignsPanel';
import ProjectPanel from './panels/ProjectPanel';
import SongPanel from './panels/SongPanel';
import WorldPanel from './panels/WorldPanel';
import TextCommandsPanel from './panels/TextCommandsPanel';
import ChatBotSettings from './components/settings/ChatBotSettings';
import TryCommandsPanel from './panels/TryCommandsPanel';
import OverlaysPanel from './panels/OverlaysPanel';
import StreamReportPanel from './panels/StreamReportPanel';
import RewardsPanel from './panels/RewardsPanel';
import QuestsPanel from './panels/QuestsPanel';
import SettingsPanel from './panels/SettingsPanel';
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
  progress: ProjectPanel,
  song: SongPanel,
  world: WorldPanel,
  textcommands: TextCommandsPanel,
  chatbot: ChatBotSettings,
  trycommands: TryCommandsPanel,
  overlays: OverlaysPanel,
  report: StreamReportPanel,
  rewards: RewardsPanel,
  quests: QuestsPanel,
  'settings-connections': SettingsConnections,
  'settings-app': SettingsApp,
  'settings-data': SettingsData,
  help: HelpPanel,
};
