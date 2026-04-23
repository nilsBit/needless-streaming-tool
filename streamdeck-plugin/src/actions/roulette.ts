import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { onEvent } from '../ws.js';

interface RouletteSettings extends JsonObject {}
interface RouletteResult {
  title?: string;
}

let connected = false;

@action({ UUID: 'com.thelab.toolkit.roulette' })
export class RouletteAction extends SingletonAction<RouletteSettings> {
  constructor() {
    super();
    onEvent((event, data) => {
      if (event === '_connected') {
        connected = true;
        this.updateAll();
      } else if (event === '_disconnected') {
        connected = false;
        this.updateAll();
      } else if (event === 'roulette-spin') {
        for (const a of this.actions) {
          a.setTitle('🎰...').catch(() => {
            /* ignore */
          });
        }
      } else if (event === 'roulette-result') {
        const result = (data as RouletteResult | undefined) ?? {};
        const text = (result.title ?? 'Done!').substring(0, 10);
        for (const a of this.actions) {
          a.setTitle(text).catch(() => {
            /* ignore */
          });
          setTimeout(() => {
            a.setTitle(connected ? 'Roulette' : 'OFFLINE').catch(() => {
              /* ignore */
            });
          }, 3000);
        }
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<RouletteSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<RouletteSettings>): Promise<void> {
    try {
      await apiPost('/api/actions/roulette', {});
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connected ? 'OFFLINE' : 'Roulette';
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => {
        /* ignore */
      });
    }
  }
}
