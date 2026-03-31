import { Client } from 'tmi.js';

export function registerEvents(_client: Client) {
  // Channel point redemptions are handled by EventSub (eventsub.ts)
  // No chat-based reward handler needed
}
