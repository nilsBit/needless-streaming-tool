import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface RouletteSettings extends JsonObject {}
interface RouletteResult {
  title?: string;
}

@action({ UUID: 'com.thelab.toolkit.roulette' })
export class RouletteAction extends SingletonAction<RouletteSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', () => this.updateAll());
    connectionManager.on('message', (event: string, data: unknown) => {
      if (event === 'roulette-spin') {
        for (const a of this.actions) {
          a.setTitle('🎰...').catch(() => { /* ignore */ });
        }
      } else if (event === 'roulette-result') {
        const result = (data as RouletteResult | undefined) ?? {};
        const text = (result.title ?? 'Done!').substring(0, 10);
        for (const a of this.actions) {
          a.setTitle(text).catch(() => { /* ignore */ });
          setTimeout(() => {
            a.setTitle(connectionManager.isConnected() ? 'Roulette' : 'OFFLINE').catch(() => { /* ignore */ });
          }, 3000);
        }
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<RouletteSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<RouletteSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    try {
      await apiPost('/api/actions/roulette', {});
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : 'Roulette';
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}
