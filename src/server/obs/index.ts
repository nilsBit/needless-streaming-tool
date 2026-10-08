import OBSWebSocket from 'obs-websocket-js';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { announceLive } from '../discord/live';
import { refreshOwnBrowserSources } from './refresh-overlays';
import { visibleOverlays, overlaysByScene } from './visible-overlays';
import { createScreenScenes, type ScreenResult } from './screens';
import { placeOverlay, type PlaceableOverlay, type PlaceResult } from './place-overlay';
import { resolveSceneMapping } from './scene-request';
import { PORT } from '../index';

let obs: OBSWebSocket | null = null;
let connected = false;
let isStreaming = false;
let isRecording = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let userDisconnect = false;

// While OBS is closed the tool tries again — 5 s, then 10, 20, 40, at most
// 60 s apart (08.10.: every 5 s built a socket, logged the error and made
// every window refetch). A connect the user asks for goes at once and starts over.
const RECONNECT_FIRST_MS = 5000;
const RECONNECT_MAX_MS = 60_000;
let reconnectDelay = RECONNECT_FIRST_MS;
let failedBefore = false;

function scheduleReconnect(): void {
  if (reconnectTimer || userDisconnect || connected) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectObs({ retry: true }).catch(() => { scheduleReconnect(); });
  }, delay);
}

/** obs-status goes out only when it changes: every window refetches on it. */
let lastStatus: boolean | null = null;
function broadcastStatus(isConnected: boolean): void {
  if (lastStatus === isConnected) return;
  lastStatus = isConnected;
  broadcast('obs-status', { connected: isConnected });
}

/**
 * What OBS was asked about scenes and our overlays, kept until OBS says that
 * something changed (08.10.). The readiness poll and every scene change asked
 * anew — one request per scene, group and source, 100+ on a full setup, all
 * landing on OBS mid-stream. Callers at the same time share one request.
 */
let scenesCache: Promise<string[]> | null = null;
let placementCache: Promise<Record<string, string[]>> | null = null;
let visibleCache: Promise<{ scene: string | null; overlays: string[] }> | null = null;

function forgetPlacement(): void { placementCache = null; visibleCache = null; }
function forgetScenes(): void { scenesCache = null; forgetPlacement(); }

export interface ObsConfig {
  host: string;
  port: number;
  password: string;
}

export function getObsConfig(): ObsConfig | null {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('obs_config') as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as ObsConfig;
  } catch {
    return null;
  }
}

export function saveObsConfig(config: ObsConfig): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('obs_config', JSON.stringify(config));
}

export function getObsStatus(): { connected: boolean } {
  return { connected };
}

export async function connectObs(opts: { retry?: boolean } = {}): Promise<boolean> {
  const config = getObsConfig();
  if (!config) {
    console.log('[OBS] No config found — skipping connection');
    return false;
  }

  if (obs && connected) {
    console.log('[OBS] Already connected');
    return true;
  }

  userDisconnect = false;
  if (!opts.retry) {
    // Asked for by the user or the start: try now, and from the first gap again.
    reconnectDelay = RECONNECT_FIRST_MS;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }
  obs = new OBSWebSocket();

  try {
    const url = `ws://${config.host}:${config.port}`;
    await obs.connect(url, config.password || undefined);
    connected = true;
    reconnectDelay = RECONNECT_FIRST_MS;
    failedBefore = false;
    forgetScenes();

    // Sync initial state
    try {
      const streamStatus = await obs.call('GetStreamStatus');
      isStreaming = streamStatus.outputActive;
    } catch (err) { console.error('[OBS] GetStreamStatus failed:', err); isStreaming = false; }
    try {
      const recordStatus = await obs.call('GetRecordStatus');
      isRecording = recordStatus.outputActive;
    } catch (err) { console.error('[OBS] GetRecordStatus failed:', err); isRecording = false; }

    // Update DB with initial state
    try {
      getDb().prepare('UPDATE stream_state SET is_live = ?, is_recording = ? WHERE id = 1').run(isStreaming ? 1 : 0, isRecording ? 1 : 0);
      broadcast('stream-state', getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
    } catch (err) { console.error('[OBS] DB state sync failed:', err); }

    // Listen for state changes
    obs.on('StreamStateChanged', (event) => {
      isStreaming = event.outputActive;
      try {
        getDb().prepare('UPDATE stream_state SET is_live = ? WHERE id = 1').run(isStreaming ? 1 : 0);
        broadcast('stream-state', getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
      } catch (err) { console.error('[OBS] DB update failed:', err); }
      console.log(`[OBS] Stream ${isStreaming ? 'started' : 'stopped'}`);
      // Only the real start — not "starting", and not the initial sync after a
      // reconnect, which would announce a stream that has been running for an hour.
      if (event.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') void announceLive();
    });

    obs.on('RecordStateChanged', (event) => {
      isRecording = event.outputActive;
      try {
        getDb().prepare('UPDATE stream_state SET is_recording = ? WHERE id = 1').run(isRecording ? 1 : 0);
        broadcast('stream-state', getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
      } catch (err) { console.error('[OBS] DB update failed:', err); }
      console.log(`[OBS] Recording ${isRecording ? 'started' : 'stopped'}`);
    });

    obs.on('ConnectionClosed', () => {
      if (!connected) return;
      console.log('[OBS] Connection closed — will auto-reconnect');
      connected = false;
      obs = null;
      isStreaming = false;
      isRecording = false;
      try {
        getDb().prepare('UPDATE stream_state SET is_live = 0, is_recording = 0 WHERE id = 1').run();
        broadcast('stream-state', getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
      } catch { /* ignore */ }
      forgetScenes();
      broadcastStatus(false);
      scheduleReconnect();
    });

    // Scene changes made in OBS itself, and sources switched on or off:
    // the panels show "in der Szene / nicht in der Szene" and need to hear about both.
    obs.on('CurrentProgramSceneChanged', (event) => {
      visibleCache = null;
      broadcast('obs-scene-changed', { scene: event.sceneName });
    });
    obs.on('SceneItemEnableStateChanged', () => {
      visibleCache = null;
      void getCurrentScene().then((scene) => broadcast('obs-scene-changed', { scene }));
    });
    // What else changes where our overlays sit, or which scenes there are.
    for (const event of ['SceneItemCreated', 'SceneItemRemoved', 'InputSettingsChanged', 'InputNameChanged', 'InputCreated', 'InputRemoved'] as const) {
      obs.on(event, forgetPlacement);
    }
    for (const event of ['SceneCreated', 'SceneRemoved', 'SceneNameChanged'] as const) {
      obs.on(event, forgetScenes);
    }

    console.log(`[OBS] Connected to ${url}`);
    broadcastStatus(true);

    // OBS may have started before us: its browser sources then loaded into
    // nothing and stay blank, because a page that never loaded cannot retry.
    // Nobody else reloads them, so we do it — every time we reach OBS.
    void refreshOwnBrowserSources(obs, PORT)
      .then((names) => {
        if (names.length) console.log(`[OBS] Reloaded overlay sources: ${names.join(', ')}`);
      })
      .catch((err) => console.error('[OBS] Reloading overlay sources failed:', err));

    return true;
  } catch (err) {
    // The whole error once; while OBS stays closed, one short line per try.
    if (!failedBefore) console.error('[OBS] Connection failed:', err);
    else console.log(`[OBS] Still not reachable — next try in ${Math.round(reconnectDelay / 1000)} s`);
    failedBefore = true;
    connected = false;
    obs = null;
    broadcastStatus(false);
    scheduleReconnect();
    return false;
  }
}

export async function disconnectObs(): Promise<void> {
  userDisconnect = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (obs && connected) {
    await obs.disconnect();
    connected = false;
    obs = null;
    isStreaming = false;
    isRecording = false;
    forgetScenes();
    broadcastStatus(false);
    console.log('[OBS] Disconnected');
  }
}

export async function changeScene(sceneName: string): Promise<{ success: boolean; error?: string }> {
  if (!obs || !connected) {
    return { success: false, error: 'OBS not connected' };
  }

  try {
    await obs.call('SetCurrentProgramScene', { sceneName });
    console.log(`[OBS] Scene changed to: ${sceneName}`);
    broadcast('obs-scene-changed', { scene: sceneName });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[OBS] Scene change failed: ${message}`);
    return { success: false, error: message };
  }
}

export async function getScenes(): Promise<string[]> {
  if (!obs || !connected) return [];
  const client = obs;
  scenesCache ??= client.call('GetSceneList')
    .then(({ scenes }) => (scenes as Array<{ sceneName: string }>).map((s) => s.sceneName))
    .catch((err) => {
      console.error('[OBS] GetSceneList failed:', err);
      scenesCache = null;
      return [];
    });
  return scenesCache;
}

/** The start, pause and end scenes — `null` while OBS is out of reach. */
export async function createScreens(): Promise<ScreenResult[] | null> {
  if (!obs || !connected) return null;
  const results = await createScreenScenes(obs, PORT);
  forgetScenes();
  const created = results.filter((r) => r.status === 'created').map((r) => r.scene);
  if (created.length) console.log(`[OBS] Created screen scenes: ${created.join(', ')}`);
  return results;
}

/** One overlay as a browser source in a scene — `null` while OBS is out of reach. */
export async function placeOverlayNow(overlay: PlaceableOverlay, scene: string): Promise<PlaceResult | null> {
  if (!obs || !connected) return null;
  const result = await placeOverlay(obs, PORT, overlay, scene);
  forgetPlacement();
  if (result.status === 'created') console.log(`[OBS] Placed overlay "${overlay.name}" in scene "${scene}"`);
  return result;
}

// --- Scene-Reward Mappings ---

export interface SceneMapping {
  reward_title: string;
  scene_name: string;
  duration_seconds?: number;
  revert_scene?: string;
}

export function getSceneMappings(): SceneMapping[] {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('obs_scene_mappings') as { value: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.value) as SceneMapping[];
  } catch {
    return [];
  }
}

export function saveSceneMappings(mappings: SceneMapping[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('obs_scene_mappings', JSON.stringify(mappings));
}

export function findSceneForReward(rewardTitle: string): SceneMapping | null {
  return resolveSceneMapping(getSceneMappings(), rewardTitle, '', null);
}

/**
 * The mapping a redemption may switch to — by the reward's title, or for a
 * "Szene" reward by the scene the viewer named, as long as that scene is one
 * the streamer approved under "Szene per Kanalpunkt". See scene-request.ts.
 */
export function sceneMappingForRedemption(rewardTitle: string, rewardType: string, userInput: string | null | undefined): SceneMapping | null {
  return resolveSceneMapping(getSceneMappings(), rewardTitle, rewardType, userInput);
}


function parseObsTimecode(timecode: string): string {
  // OBS returns "HH:MM:SS.mmm" — strip milliseconds
  return timecode.split('.')[0];
}

export async function getStreamTimecodes(): Promise<{
  stream_timecode: string | null;
  recording_timecode: string | null;
}> {
  if (!obs || !connected) {
    return { stream_timecode: null, recording_timecode: null };
  }

  const results: { stream_timecode: string | null; recording_timecode: string | null } = {
    stream_timecode: null,
    recording_timecode: null,
  };

  const promises: Promise<void>[] = [];

  if (isStreaming) {
    promises.push(
      obs.call('GetStreamStatus').then((status) => {
        if (status.outputActive && status.outputTimecode) {
          results.stream_timecode = parseObsTimecode(status.outputTimecode);
        }
      }).catch(() => {})
    );
  }

  if (isRecording) {
    promises.push(
      obs.call('GetRecordStatus').then((status) => {
        if (status.outputActive && status.outputTimecode) {
          results.recording_timecode = parseObsTimecode(status.outputTimecode);
        }
      }).catch(() => {})
    );
  }

  await Promise.all(promises);
  return results;
}

export async function getCurrentScene(): Promise<string | null> {
  if (!obs || !connected) return null;

  try {
    const { currentProgramSceneName } = await obs.call('GetCurrentProgramScene');
    return currentProgramSceneName;
  } catch {
    return null;
  }
}

/** The overlays on screen in the current scene — `scene: null` while OBS is out of reach. */
export async function getVisibleOverlays(): Promise<{ scene: string | null; overlays: string[] }> {
  if (!obs || !connected) return { scene: null, overlays: [] };
  const client = obs;
  visibleCache ??= (async () => {
    const scene = await getCurrentScene();
    if (!scene) { visibleCache = null; return { scene: null, overlays: [] }; }
    try {
      return { scene, overlays: await visibleOverlays(client, PORT, scene) };
    } catch (err) {
      console.error('[OBS] Reading the visible overlays failed:', err);
      visibleCache = null;
      return { scene, overlays: [] };
    }
  })();
  return visibleCache;
}

/** Every scene each own overlay is placed in — `connected: false` while OBS is out of reach. */
export async function getOverlayScenes(): Promise<{ connected: boolean; byOverlay: Record<string, string[]> }> {
  if (!obs || !connected) return { connected: false, byOverlay: {} };
  const client = obs;
  placementCache ??= overlaysByScene(client, PORT).catch((err) => {
    console.error('[OBS] Reading where the overlays sit failed:', err);
    placementCache = null;
    return {};
  });
  return { connected: true, byOverlay: await placementCache };
}
