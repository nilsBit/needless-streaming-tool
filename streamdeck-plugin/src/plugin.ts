import streamDeck, { LogLevel } from '@elgato/streamdeck';
import { updateSettings, type Settings } from './api.js';
import { startWs, restartWs } from './ws.js';

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

streamDeck.settings.onDidReceiveGlobalSettings<Partial<Settings>>((ev) => {
  updateSettings(ev.settings);
  restartWs();
});

(async () => {
  try {
    const initial = await streamDeck.settings.getGlobalSettings<Partial<Settings>>();
    updateSettings(initial);
  } catch {
    /* first-run: no settings yet, defaults are fine */
  }
  startWs();
  await streamDeck.connect();
})();
