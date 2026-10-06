import tmi from 'tmi.js';
import { getBotConfig, botTokenProblem } from './config';
import { registerCommands } from './commands';
import { sayInParts } from './chat-message';
import { registerEvents } from './events';
import { connectEventSub, disconnectEventSub } from './eventsub';
import { broadcast } from '../websocket/index';
import { createReminder, getReminderSettings } from './reminder';

let client: tmi.Client | null = null;
let connected = false;

// The reminder the bot says on its own (bot/reminder.ts); the timer asks every half minute.
export const reminder = createReminder();
let reminderTimer: ReturnType<typeof setInterval> | null = null;
const REMINDER_TICK_MS = 30_000;

let lastError: string | null = null;

/** What the connection marks and the Twitch card show: connected, the channel, and if not connected, why. */
export function getBotStatus(): { connected: boolean; channel: string | null; error: string | null } {
  const config = getBotConfig();
  return { connected, channel: config?.channel || null, error: connected ? null : (botTokenProblem() ?? lastError) };
}

export async function connectBot(): Promise<boolean> {
  const config = getBotConfig();
  if (!config) {
    console.log('[Bot] No config found — skipping connection');
    return false;
  }
  if (!config.oauth_token) {
    console.error(`[Bot] ${botTokenProblem() ?? 'No token stored'}`);
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
    lastError = null;
    broadcast('bot-status', { connected: true, channel: config.channel });
    console.log(`[Bot] Connected to #${config.channel}`);

    if (!reminderTimer) {
      reminderTimer = setInterval(() => {
        const { minutes, text } = getReminderSettings();
        if (!reminder.due(minutes)) return;
        reminder.sent();
        sayInChat(text);
        console.log('[Bot] Reminder said');
      }, REMINDER_TICK_MS);
    }

    // Start EventSub for channel point redemptions
    connectEventSub().catch((err) => console.error('[Bot] EventSub failed:', err));

    return true;
  } catch (err) {
    console.error('[Bot] Connection failed:', err);
    connected = false;
    const text = String(err);
    lastError = /authentication|login/i.test(text)
      ? 'Twitch hat die Anmeldung abgelehnt – der Token ist abgelaufen oder ungültig. Einmal neu mit Twitch anmelden.'
      : `Verbindung zu Twitch fehlgeschlagen: ${text.slice(0, 120)}`;
    broadcast('bot-status', { connected: false, channel: null, error: lastError });
    return false;
  }
}

export function sayInChat(message: string) {
  if (!client || !connected) return;
  const config = getBotConfig();
  if (config?.channel) {
    void sayInParts(client, config.channel, message);
  }
}

export async function disconnectBot(): Promise<void> {
  disconnectEventSub();
  if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
  if (client && connected) {
    await client.disconnect();
    connected = false;
    client = null;
    broadcast('bot-status', { connected: false, channel: null });
    console.log('[Bot] Disconnected');
  }
}
