import streamDeck, { LogLevel } from '@elgato/streamdeck';
import { apiGet, updateSettings, type Settings } from './api.js';
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

// Handle PI messages for onboarding wizard and dynamic data
streamDeck.ui.onSendToPlugin(async (ev) => {
  const payload = ev.payload as { type?: string } | undefined;
  if (payload?.type === 'checkConnection') {
    const info = connectionManager.getConnectionInfo();
    streamDeck.ui.current?.sendToPropertyInspector({
      type: 'connectionStatus',
      connected: info.connected,
      port: info.port,
    });
    return;
  }
  if (payload?.type === 'getClipTags') {
    try {
      const tags = await apiGet<{ tag: string; emoji: string; preset: boolean }[]>('/api/clip-tags');
      streamDeck.ui.current?.sendToPropertyInspector({ type: 'clipTags', tags });
    } catch {
      streamDeck.ui.current?.sendToPropertyInspector({ type: 'clipTags', tags: [], error: true });
    }
  }
});

(async () => {
  // Try reading connection file before connecting
  connectionManager.readConnectionFile();

  // Connect to Stream Deck FIRST — settings.getGlobalSettings requires an open
  // connection, otherwise connection.send() awaits the connection promise
  // forever and the Node event loop exits before Stream Deck registers us.
  await streamDeck.connect();

  // Now safe to read persisted global settings
  try {
    const initial = await streamDeck.settings.getGlobalSettings<Partial<Settings>>();
    if (initial.apiToken) {
      updateSettings(initial);
    }
  } catch {
    /* first-run: no settings yet, defaults are fine */
  }

  connectionManager.start();
})();
