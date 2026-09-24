import { Client } from 'tmi.js';
import { clearChatFeed, feedChatMessage, removeChatMessage, removeChatUser } from './chat-feed';

export function registerEvents(client: Client) {
  // Channel point redemptions are handled by EventSub (eventsub.ts)

  // The chat overlay: what viewers write, and what moderators take back.
  // The bot's own answers (`self`) stay out, like the commands they answer.
  client.on('message', (_channel, tags, message, self) => {
    if (!self) feedChatMessage(tags, message);
  });
  client.on('messagedeleted', (_channel, _username, _message, userstate) => {
    const id = userstate['target-msg-id'];
    if (id) removeChatMessage(id);
  });
  client.on('timeout', (_channel, username) => removeChatUser(username));
  client.on('ban', (_channel, username) => removeChatUser(username));
  client.on('clearchat', () => clearChatFeed(true));
}
