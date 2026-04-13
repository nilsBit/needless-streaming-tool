import OBSWebSocket from 'obs-websocket-js';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

let obs: OBSWebSocket | null = null;
let connected = false;

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

export async function connectObs(): Promise<boolean> {
  const config = getObsConfig();
  if (!config) {
    console.log('[OBS] No config found — skipping connection');
    return false;
  }

  if (obs && connected) {
    console.log('[OBS] Already connected');
    return true;
  }

  obs = new OBSWebSocket();

  try {
    const url = `ws://${config.host}:${config.port}`;
    await obs.connect(url, config.password || undefined);
    connected = true;
    console.log(`[OBS] Connected to ${url}`);
    broadcast('obs-status', { connected: true });
    return true;
  } catch (err) {
    console.error('[OBS] Connection failed:', err);
    connected = false;
    obs = null;
    broadcast('obs-status', { connected: false });
    return false;
  }
}

export async function disconnectObs(): Promise<void> {
  if (obs && connected) {
    await obs.disconnect();
    connected = false;
    obs = null;
    broadcast('obs-status', { connected: false });
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

  try {
    const { scenes } = await obs.call('GetSceneList');
    return (scenes as Array<{ sceneName: string }>).map((s) => s.sceneName);
  } catch (err) {
    console.error('[OBS] GetSceneList failed:', err);
    return [];
  }
}

// --- Scene-Reward Mappings ---

export interface SceneMapping {
  reward_title: string;
  scene_name: string;
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

export function findSceneForReward(rewardTitle: string): string | null {
  const mappings = getSceneMappings();
  const titleLower = rewardTitle.toLowerCase();
  const match = mappings.find((m) => titleLower.includes(m.reward_title.toLowerCase()));
  return match?.scene_name || null;
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
