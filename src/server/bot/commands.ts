import { Client } from 'tmi.js';
import { getDb } from '../db/index';
import { startVote, castVote, getActiveVote, endVote } from './voting';
import { StreamState, Issue } from '../../shared/types';
import { broadcast } from '../websocket/index';
import { standingsText } from '../leaderboards';
import { sayInParts } from './chat-message';
import { builtinKeyOf, triggerOf, canonicalTrigger, getCommandNames } from './command-names';
import { commandEnabled } from '../features';
import { answerChatMessage } from './chat-answers';
import { builtinCooldownSeconds, INFO_BUILTINS, passCooldown } from './cooldown';
import { botHelix, shoutoutText } from './shoutout';
import { adjustReply } from '../points/chat';
import { parseRedeem, redeem } from '../points/redeem';

/** Built-ins that answer through answerChatMessage, which applies the info cooldown itself. */
const ANSWERED_IN_CHAT_ANSWERS: ReadonlySet<string> = new Set(['commands', 'privacy', 'points', 'rewards_list', 'progress']);

/** Broadcaster and mods — the people allowed to steer the stream from chat. */
function isPrivileged(tags: { mod?: boolean; badges?: { broadcaster?: string } | null }): boolean {
  return !!tags.mod || tags.badges?.broadcaster === '1';
}

export function registerCommands(client: Client) {
  client.on('message', async (channel, tags, message, self) => {
    if (self) return;
    if (!message.startsWith('!')) return;

    // Every reply goes out through the splitter, so none can exceed Twitch's limit.
    const say = (text: string) => void sayInParts(client, channel, text);

    const input = canonicalTrigger(triggerOf(message));
    const command = builtinKeyOf(input);
    // A built-in of a feature that is off ("Was dein Stream kann") is not there for the chat.
    if (command !== null && !commandEnabled(command)) return;

    // The built-ins that only tell something share one cooldown. The ones that
    // answer in chat-answers.ts are gated there — checked here as well, the
    // second check saw the first one's cooldown and `!datenschutz` never
    // answered a viewer (found 2026-10-08).
    if (command !== null && INFO_BUILTINS.has(command) && !ANSWERED_IN_CHAT_ANSWERS.has(command)
      && !passCooldown(`builtin:${command}`, builtinCooldownSeconds(), isPrivileged(tags), { viewer: tags.username })) return;

    switch (command) {
      case 'shoutout': {
        if (!isPrivileged(tags)) break;
        const name = message.trim().split(/\s+/)[1] ?? '';
        say(await shoutoutText(name, botHelix() ?? (async () => null)));
        break;
      }

      case 'challenge': {
        const state = getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get() as StreamState;
        if (!state.challenge_title) {
          say('Keine Challenge aktiv.');
        } else {
          const statusEmoji = state.challenge_status === 'in_progress' ? '🔴' : state.challenge_status === 'done' ? '🟢' : state.challenge_status === 'failed' ? '❌' : '⏸️';
          say(`${statusEmoji} Challenge: ${state.challenge_title} [${state.challenge_status}]`);
        }
        break;
      }

      case 'issues': {
        const bugs = getDb().prepare('SELECT * FROM issues WHERE status = ? ORDER BY created_at DESC LIMIT 5').all('open') as Issue[];
        if (bugs.length === 0) {
          say('Keine offenen Themen! 🎉');
        } else {
          const list = bugs.map((b, i) => `${i + 1}. ${b.title}`).join(' | ');
          say(`⚠️ Offene Themen (${bugs.length}): ${list}`);
        }
        break;
      }

      case 'song': {
        const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('current_song') as { value: string } | undefined;
        if (row?.value) {
          try {
            const d = JSON.parse(row.value) as { title: string; artist?: string };
            say(`🎵 ${d.artist ? d.artist + ' — ' : ''}${d.title}`);
          } catch {
            say(`🎵 ${row.value}`);
          }
        } else {
          say('🎵 Kein Song aktiv.');
        }
        break;
      }

      case 'hype': {
        broadcast('compile-pray', { user: tags['display-name'] || tags.username || 'Chat' });
        say('🙌 HYPE MOMENT!');
        break;
      }

      case 'design': {
        // Starting, ending or reading out a vote is the streamer's and the mods' call.
        if (!isPrivileged(tags)) break;
        const args = message.trim().split(/\s+/).slice(1);
        const subCommand = args[0]?.toLowerCase();
        // Replies name the commands as the streamer has them, not as they were once called.
        const { design: self, vote: voteName } = getCommandNames();

        if (subCommand === 'start') {
          const duration = parseInt(args[1], 10) || 60;
          const options = args.slice(2);
          if (options.length < 2) {
            say(`❌ Mindestens 2 Optionen: ${self} start 60 option1 option2 ...`);
            break;
          }
          const success = startVote('🗳️ Abstimmung', options, duration);
          if (success) {
            say(`🗳️ ABSTIMMUNG! Schreibt ${voteName} <option> — Optionen: ${options.join(', ')} — ${duration}s Zeit!`);
          } else {
            say('❌ Es läuft bereits eine Abstimmung!');
          }
        } else if (subCommand === 'end') {
          const result = endVote();
          if (result) {
            const sorted = Object.entries(result.counts).sort((a, b) => b[1] - a[1]);
            const resultText = sorted.map(([opt, count]) => `${opt}: ${count}`).join(' | ');
            say(`🗳️ ERGEBNIS: ${resultText} — Gewinner: ${result.winner} 🏆`);
          } else {
            say('❌ Keine aktive Abstimmung.');
          }
        } else if (subCommand === 'status') {
          const vote = getActiveVote();
          if (vote) {
            const countsText = vote.options.map((o) => `${o}: ${vote.counts[o] || 0}`).join(' | ');
            say(`🗳️ Abstimmung: ${countsText} — noch ${vote.remaining}s`);
          } else {
            say('❌ Keine aktive Abstimmung.');
          }
        } else {
          say(`🗳️ Befehle: ${self} start <sekunden> <opt1> <opt2> ... | ${self} end | ${self} status`);
        }
        break;
      }

      case 'vote': {
        const option = message.trim().split(/\s+/).slice(1).join(' ');
        const username = tags['display-name'] || tags.username || 'anon';
        if (!option) {
          say(`❌ Schreib ${getCommandNames().vote} <option>`);
          break;
        }
        const success = castVote(username, option);
        if (!success) {
          const vote = getActiveVote();
          if (!vote) {
            say('❌ Keine aktive Abstimmung.');
          } else {
            say(`❌ Ungültige Option. Wähle: ${vote.options.join(', ')}`);
          }
        }
        break;
      }

      case 'rewardstats': {
        const args = message.trim().split(' ').slice(1);
        // Only a login is looked up and echoed — never arbitrary text from the message.
        const asked = args[0]?.replace(/^@/, '') ?? '';
        const target = /^[a-z0-9_]{1,25}$/i.test(asked) ? asked : (tags.username || 'Unknown');
        say(standingsText(target));
        break;
      }

      // `!punkte geben|nehmen @name n` for mods; everything else is `!punkte [Name]` below.
      case 'points': {
        const adjusted = isPrivileged(tags) ? adjustReply(message) : null;
        if (adjusted !== null) { say(adjusted); break; }
        const answer = await answerChatMessage(message, isPrivileged(tags), tags.username);
        for (const reply of answer.replies ?? []) say(reply);
        break;
      }

      case 'redeem': {
        if (!tags.username) break;
        const { name, input } = parseRedeem(message.trim().replace(/^\S+\s*/, ''));
        if (!name) { say(`@${tags['display-name'] ?? tags.username} !einlösen <Name> — !belohnungen zeigt, was es gibt.`); break; }
        const result = await redeem(tags.username, tags['display-name'] ?? tags.username, name, input);
        say(result.message);
        break;
      }

      // `!befehle`, `!datenschutz`, Text Commands and Lookup Commands: the same path the app's "try it" box takes.
      case 'commands':
      default: {
        const answer = await answerChatMessage(message, isPrivileged(tags), tags.username);
        for (const reply of answer.replies ?? []) say(reply);
        break;
      }
    }
  });
}
