import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { onEvent } from '../ws.js';

type JsonValue = string | number | boolean | null | undefined | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

interface SceneSettings extends JsonObject {
  sceneName?: string;
}

let currentScene: string | null = null;
let connected = false;

@action({ UUID: 'com.thelab.toolkit.scene' })
export class SceneAction extends SingletonAction<SceneSettings> {
  constructor() {
    super();
    onEvent((event, data) => {
      if (event === '_connected') {
        connected = true;
        this.updateAll();
      } else if (event === '_disconnected') {
        connected = false;
        this.updateAll();
      } else if (event === 'obs-scene-changed') {
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
    const title = !connected ? 'OFFLINE' : (currentScene ?? 'Scene');
    for (const a of this.actions) {
      a.setTitle(title).catch(() => { /* ignore */ });
    }
  }
}
