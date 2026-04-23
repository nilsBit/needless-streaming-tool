import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface SceneSettings extends JsonObject {
  sceneName?: string;
}

let currentScene: string | null = null;

@action({ UUID: 'com.thelab.toolkit.scene' })
export class SceneAction extends SingletonAction<SceneSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', () => this.updateAll());
    connectionManager.on('message', (event: string, data: unknown) => {
      if (event === 'obs-scene-changed') {
        const payload = data as { scene?: string } | undefined;
        if (payload?.scene) {
          currentScene = payload.scene;
          this.updateAll();
        }
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<SceneSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<SceneSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const scene = ev.payload.settings.sceneName?.trim();
    if (!scene) {
      await ev.action.showAlert();
      return;
    }
    try {
      await apiPost('/api/obs/scene', { scene });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const title = !connectionManager.isConnected() ? 'OFFLINE' : (currentScene ?? 'Scene');
    for (const a of this.actions) {
      a.setTitle(title).catch(() => { /* ignore */ });
    }
  }
}
