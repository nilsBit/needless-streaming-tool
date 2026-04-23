import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface CompilePraySettings extends JsonObject {}

@action({ UUID: 'com.nst.deck.compile-pray' })
export class CompilePrayAction extends SingletonAction<CompilePraySettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', () => this.updateAll());
    connectionManager.on('message', (event: string) => {
      if (event === 'compile-pray') {
        for (const a of this.actions) {
          a.setTitle('🙏').catch(() => { /* ignore */ });
          setTimeout(() => {
            a.setTitle(connectionManager.isConnected() ? 'Compile' : 'OFFLINE').catch(() => { /* ignore */ });
          }, 2000);
        }
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<CompilePraySettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<CompilePraySettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    try {
      await apiPost('/api/actions/compile-pray', {});
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : 'Compile';
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}
