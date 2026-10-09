import { Client } from 'tmi.js';
import { createGiftCounter, sendAlert } from './alerts';
import { clearChatFeed, feedChatMessage, removeChatMessage, removeChatUser } from './chat-feed';
import { sayInParts } from './chat-message';
import { botHelix, raidShoutoutEnabled, shoutoutText } from './shoutout';
import { reminder } from './index';
import { onBits, onChatMessage, onGift, onRaid, onSub } from '../points/earn';
import { noteChat } from '../stream-report/log';

/** A raid's crowd arrives a moment after the notice; the shoutout waits for them. */
const RAID_SHOUTOUT_DELAY_MS = 4000;

export function registerEvents(client: Client) {
  // Channel point redemptions are handled by EventSub (eventsub.ts), and so
  // are follows — everything below comes over chat and needs no extra scope.
  const gifts = createGiftCounter();

  // Own points go by login; the sub events carry it in the userstate.
  client.on('subscription', (_channel, username, _methods, message, userstate) => {
    sendAlert('sub', { user: username, message });
    onSub(userstate?.login ?? username, username);
  });
  client.on('resub', (_channel, username, months, message, userstate) => {
    // The cumulative count is what a viewer means by "I'm here since …".
    sendAlert('resub', { user: username, months: userstate?.['msg-param-cumulative-months'] ?? months, message });
    onSub(userstate?.login ?? username, username);
  });
  client.on('subgift', (_channel, username, _streak, recipient, _methods, userstate) => {
    // A gift out of a mystery gift was alerted and credited as part of it.
    if (gifts.fromMystery(username)) return;
    sendAlert('subgift', { user: username, recipient });
    onGift(userstate?.login ?? username, 1, username);
  });
  client.on('submysterygift', (_channel, username, numbOfSubs, _methods, userstate) => {
    gifts.mystery(username, Number(numbOfSubs) || 0);
    sendAlert('subgift', { user: username, count: numbOfSubs });
    onGift(userstate?.login ?? username, Number(numbOfSubs) || 0, username);
  });
  client.on('raided', (channel, username, viewers) => {
    sendAlert('raid', { user: username, viewers });
    onRaid(username);
    if (!raidShoutoutEnabled()) return;
    setTimeout(async () => {
      const helix = botHelix() ?? (async () => null);
      void sayInParts(client, channel, await shoutoutText(username, helix));
    }, RAID_SHOUTOUT_DELAY_MS);
  });
  client.on('cheer', (_channel, userstate, message) => {
    sendAlert('cheer', { user: userstate['display-name'] ?? userstate.username, bits: userstate.bits, message });
    if (userstate.username) onBits(userstate.username, Number(userstate.bits) || 0, userstate['display-name']);
  });

  // The chat overlay: what viewers write, and what moderators take back.
  // The bot's own answers (`self`) stay out, like the commands they answer.
  client.on('message', (_channel, tags, message, self) => {
    if (self) return;
    feedChatMessage(tags, message);
    reminder.noteChat();
    if (tags.username) {
      onChatMessage(tags.username, tags['display-name']);
      noteChat(tags.username, tags['display-name'], message);
    }
  });
  client.on('messagedeleted', (_channel, _username, _message, userstate) => {
    const id = userstate['target-msg-id'];
    if (id) removeChatMessage(id);
  });
  client.on('timeout', (_channel, username) => removeChatUser(username));
  client.on('ban', (_channel, username) => removeChatUser(username));
  client.on('clearchat', () => clearChatFeed(true));
}
