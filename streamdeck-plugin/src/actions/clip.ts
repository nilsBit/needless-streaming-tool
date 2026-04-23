import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface ClipSettings extends JsonObject {
  tag?: string;
}

interface ClipRow {
  session_date?: string;
}

let clipCount = 0;

function today(): string {
  return new Date().toISOString().split('T')[0];
}

async function fetchCount(): Promise<void> {
  try {
    const clips = await apiGet<ClipRow[]>('/api/clips');
    const d = today();
    clipCount = Array.isArray(clips) ? clips.filter((c) => c.session_date === d).length : 0;
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.thelab.toolkit.clip' })
export class ClipAction extends SingletonAction<ClipSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchCount();
      this.updateAll();
    });
    connectionManager.on('message', (event: string) => {
      if (event === 'clip-created') {
        clipCount += 1;
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<ClipSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<ClipSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const tag = ev.payload.settings.tag?.trim() || 'highlight';
    try {
      await apiPost('/api/clips', { tag });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const title = !connectionManager.isConnected() ? 'OFFLINE' : `${clipCount} Clips`;
    for (const a of this.actions) {
      a.setTitle(title).catch(() => { /* ignore */ });
    }
  }
}
