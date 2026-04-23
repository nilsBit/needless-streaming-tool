import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { onEvent } from '../ws.js';

interface CompilePraySettings extends JsonObject {}

let connected = false;

@action({ UUID: 'com.thelab.toolkit.compile-pray' })
export class CompilePrayAction extends SingletonAction<CompilePraySettings> {
  constructor() {
    super();
    onEvent((event) => {
      if (event === '_connected') {
        connected = true;
        this.updateAll();
      } else if (event === '_disconnected') {
        connected = false;
        this.updateAll();
      } else if (event === 'compile-pray') {
        for (const a of this.actions) {
          a.setTitle('🙏').catch(() => {
            /* ignore */
          });
          setTimeout(() => {
            a.setTitle(connected ? 'Compile' : 'OFFLINE').catch(() => {
              /* ignore */
            });
          }, 2000);
        }
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<CompilePraySettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<CompilePraySettings>): Promise<void> {
    try {
      await apiPost('/api/actions/compile-pray', {});
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connected ? 'OFFLINE' : 'Compile';
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => {
        /* ignore */
      });
    }
  }
}
