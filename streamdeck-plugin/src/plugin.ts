import streamDeck, { LogLevel } from '@elgato/streamdeck';
import { updateSettings, type Settings } from './api.js';
import { connectionManager } from './connection.js';

import { SceneAction } from './actions/scene.js';
import { ClipAction } from './actions/clip.js';
import { BugAction } from './actions/bug.js';
import { ExperimentAction } from './actions/experiment.js';
import { TodoAction } from './actions/todo.js';
import { MilestoneAction } from './actions/milestone.js';
import { CompilePrayAction } from './actions/compile-pray.js';
import { RouletteAction } from './actions/roulette.js';

streamDeck.logger.setLevel(LogLevel.INFO);

streamDeck.actions.registerAction(new SceneAction());
streamDeck.actions.registerAction(new ClipAction());
streamDeck.actions.registerAction(new BugAction());
streamDeck.actions.registerAction(new ExperimentAction());
streamDeck.actions.registerAction(new TodoAction());
streamDeck.actions.registerAction(new MilestoneAction());
streamDeck.actions.registerAction(new CompilePrayAction());
streamDeck.actions.registerAction(new RouletteAction());

// When user changes global settings manually (from PI advanced section)
streamDeck.settings.onDidReceiveGlobalSettings<Partial<Settings>>((ev) => {
  updateSettings(ev.settings);
  // Restart connection with new settings
  connectionManager.stop();
  connectionManager.start();
});

// Handle PI messages for onboarding wizard
streamDeck.ui.onSendToPlugin((ev) => {
  const payload = ev.payload as { type?: string } | undefined;
  if (payload?.type === 'checkConnection') {
    const info = connectionManager.getConnectionInfo();
    streamDeck.ui.current?.sendToPropertyInspector({
      type: 'connectionStatus',
      connected: info.connected,
      port: info.port,
    });
  }
});

(async () => {
  // Try reading connection file before connecting
  connectionManager.readConnectionFile();

  // Also try loading persisted global settings
  try {
    const initial = await streamDeck.settings.getGlobalSettings<Partial<Settings>>();
    // Only apply global settings if they have a token and connection file didn't already set one
    if (initial.apiToken) {
      updateSettings(initial);
    }
  } catch {
    /* first-run: no settings yet, defaults are fine */
  }

  await streamDeck.connect();

  // Start ConnectionManager AFTER streamDeck.connect() resolves
  connectionManager.start();
})();
