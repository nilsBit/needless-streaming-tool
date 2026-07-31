import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface CharacterSettings extends JsonObject {}

interface ActiveCharacter {
  name?: string;
}

/** Fits a name onto a key: two lines, cut where it would overflow. */
function fitTitle(name: string): string {
  const words = name.split(' ');
  if (words.length === 1) return name.length > 9 ? name.slice(0, 8) + '…' : name;

  const first = words[0];
  const rest = words.slice(1).join(' ');
  const line1 = first.length > 9 ? first.slice(0, 8) + '…' : first;
  const line2 = rest.length > 9 ? rest.slice(0, 8) + '…' : rest;
  return `${line1}\n${line2}`;
}

/**
 * Cycles the character shown on the story overlay.
 *
 * Takes no settings on purpose — one press moves to the next character, so the
 * button keeps working when characters are added or removed in Notion, and
 * there is nothing to configure before a stream.
 */
@action({ UUID: 'com.nst.deck.character' })
export class CharacterAction extends SingletonAction<CharacterSettings> {
  private currentName: string | null = null;

  constructor() {
    super();
    connectionManager.on('stateChange', () => this.updateAll());
    connectionManager.on('message', (event: string, data: unknown) => {
      if (event !== 'character-changed') return;
      const character = data as ActiveCharacter | null;
      this.currentName = character?.name ?? null;
      this.updateAll();
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<CharacterSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<CharacterSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    try {
      const result = await apiPost<{ character?: ActiveCharacter }>('/api/characters/cycle', {});
      // The websocket broadcast usually beats this, but update anyway so the key
      // is right even if the socket dropped.
      if (result?.character?.name) {
        this.currentName = result.character.name;
        this.updateAll();
      }
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const title = !connectionManager.isConnected()
      ? 'OFFLINE'
      : this.currentName
        ? fitTitle(this.currentName)
        : 'Figur';
    for (const a of this.actions) {
      a.setTitle(title).catch(() => { /* ignore */ });
    }
  }
}
