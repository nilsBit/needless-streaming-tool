import tmi from 'tmi.js';
import { getBotConfig } from './config';
import { registerCommands } from './commands';
import { registerEvents } from './events';
import { connectEventSub, disconnectEventSub } from './eventsub';
import { broadcast } from '../websocket/index';

let client: tmi.Client | null = null;
let connected = false;

export function getBotStatus(): { connected: boolean; channel: string | null } {
  const config = getBotConfig();
  return { connected, channel: config?.channel || null };
}

export function getClient(): tmi.Client | null {
  return client;
}

export async function connectBot(): Promise<boolean> {
  const config = getBotConfig();
  if (!config) {
    console.log('[Bot] No config found — skipping connection');
    return false;
  }

  if (client && connected) {
    console.log('[Bot] Already connected');
    return true;
  }

  client = new tmi.Client({
    options: { debug: false },
    identity: {
      username: config.username,
      password: config.oauth_token,
    },
    channels: [config.channel],
  });

  registerCommands(client);
  registerEvents(client);

  try {
    await client.connect();
    connected = true;
    broadcast('bot-status', { connected: true, channel: config.channel });
    console.log(`[Bot] Connected to #${config.channel}`);

    // Start EventSub for channel point redemptions
    connectEventSub().catch((err) => console.error('[Bot] EventSub failed:', err));

    return true;
  } catch (err) {
    console.error('[Bot] Connection failed:', err);
    connected = false;
    broadcast('bot-status', { connected: false, channel: null });
    return false;
  }
}

export function sayInChat(message: string) {
  if (!client || !connected) return;
  const config = getBotConfig();
  if (config?.channel) {
    client.say(config.channel, message).catch((err: Error) => {
      console.error('[Bot] Say failed:', err.message);
    });
  }
}

export async function disconnectBot(): Promise<void> {
  disconnectEventSub();
  if (client && connected) {
    await client.disconnect();
    connected = false;
    client = null;
    broadcast('bot-status', { connected: false, channel: null });
    console.log('[Bot] Disconnected');
  }
}
