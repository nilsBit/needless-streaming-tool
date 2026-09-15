import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface PinSettings extends JsonObject {}

interface FollowState {
  enabled: boolean;
  held: boolean;
  available: boolean;
}

/**
 * Pins the story card, or lets it follow Worldbuilder again.
 *
 * While following, the card switches to whatever entry is open in
 * Worldbuilder. One press holds the card where it is; the next press lets it
 * follow again. Takes no settings — there is nothing to decide before a stream.
 */
@action({ UUID: 'com.nst.deck.pin' })
export class PinAction extends SingletonAction<PinSettings> {
  private state: FollowState | null = null;

  constructor() {
    super();
    connectionManager.on('stateChange', () => { void this.refresh(); });
    connectionManager.on('message', (event: string, data: unknown) => {
      if (event !== 'follow-changed') return;
      this.state = data as FollowState;
      this.updateAll();
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<PinSettings>): Promise<void> {
    await this.refresh();
  }

  override async onKeyDown(ev: KeyDownEvent<PinSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    try {
      this.state = await apiPost<FollowState>('/api/entries/follow/toggle-hold', {});
      this.updateAll();
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private async refresh(): Promise<void> {
    if (connectionManager.isConnected()) {
      try {
        this.state = await apiGet<FollowState>('/api/entries/follow');
      } catch {
        this.state = null;
      }
    }
    this.updateAll();
  }

  private updateAll(): void {
    const title = !connectionManager.isConnected()
      ? 'OFFLINE'
      : !this.state
        ? 'Karte'
        : !this.state.enabled || !this.state.available
          ? 'Folgen\naus'
          : this.state.held
            ? 'Fest-\ngepinnt'
            : 'Folgt';
    for (const a of this.actions) {
      a.setTitle(title).catch(() => { /* ignore */ });
    }
  }
}
