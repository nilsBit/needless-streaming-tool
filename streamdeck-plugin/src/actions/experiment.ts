import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPatch } from '../api.js';
import { onEvent } from '../ws.js';

interface ExperimentSettings extends JsonObject {
  action?: 'running' | 'success' | 'failed' | 'idle';
}

interface StreamState {
  challenge_status?: string;
  challenge_title?: string;
}

const STATUS_EMOJI: Record<string, string> = {
  idle: '⏸️',
  in_progress: '🔴',
  done: '🟢',
  failed: '❌',
};

const PI_TO_STATUS: Record<string, string> = {
  running: 'in_progress',
  success: 'done',
  failed: 'failed',
  idle: 'idle',
};

let status = 'idle';
let title = '';
let connected = false;

async function fetchState(): Promise<void> {
  try {
    const s = await apiGet<StreamState>('/public/stream-state');
    status = s?.challenge_status ?? 'idle';
    title = s?.challenge_title ?? '';
  } catch {
    /* leave as-is */
  }
}

@action({ UUID: 'com.thelab.toolkit.experiment' })
export class ExperimentAction extends SingletonAction<ExperimentSettings> {
  constructor() {
    super();
    onEvent(async (event, data) => {
      if (event === '_connected') {
        connected = true;
        await fetchState();
        this.updateAll();
      } else if (event === '_disconnected') {
        connected = false;
        this.updateAll();
      } else if (event === 'stream-state') {
        const s = data as StreamState | undefined;
        status = s?.challenge_status ?? status;
        title = s?.challenge_title ?? title;
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<ExperimentSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<ExperimentSettings>): Promise<void> {
    const piValue = ev.payload.settings.action ?? 'running';
    const challengeStatus = PI_TO_STATUS[piValue] ?? piValue;
    try {
      await apiPatch('/api/stream-state', { challenge_status: challengeStatus });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    let display: string;
    if (!connected) {
      display = 'OFFLINE';
    } else {
      const emoji = STATUS_EMOJI[status] ?? '⏸️';
      display = title ? `${emoji} ${title.substring(0, 8)}` : `${emoji} Exp`;
    }
    for (const a of this.actions) {
      a.setTitle(display).catch(() => {
        /* ignore */
      });
    }
  }
}
