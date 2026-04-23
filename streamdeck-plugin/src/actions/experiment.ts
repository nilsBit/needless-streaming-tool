import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPatch } from '../api.js';
import { connectionManager } from '../connection.js';

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

let challengeStatus = 'idle';
let challengeTitle = '';

async function fetchState(): Promise<void> {
  try {
    const s = await apiGet<StreamState>('/public/stream-state');
    challengeStatus = s?.challenge_status ?? 'idle';
    challengeTitle = s?.challenge_title ?? '';
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.thelab.toolkit.experiment' })
export class ExperimentAction extends SingletonAction<ExperimentSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchState();
      this.updateAll();
    });
    connectionManager.on('message', (event: string, data: unknown) => {
      if (event === 'stream-state') {
        const s = data as StreamState | undefined;
        challengeStatus = s?.challenge_status ?? challengeStatus;
        challengeTitle = s?.challenge_title ?? challengeTitle;
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<ExperimentSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<ExperimentSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const piValue = ev.payload.settings.action ?? 'running';
    const status = PI_TO_STATUS[piValue] ?? piValue;
    try {
      await apiPatch('/api/stream-state', { challenge_status: status });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    let display: string;
    if (!connectionManager.isConnected()) {
      display = 'OFFLINE';
    } else {
      const emoji = STATUS_EMOJI[challengeStatus] ?? '⏸️';
      display = challengeTitle ? `${emoji} ${challengeTitle.substring(0, 8)}` : `${emoji} Exp`;
    }
    for (const a of this.actions) {
      a.setTitle(display).catch(() => { /* ignore */ });
    }
  }
}
