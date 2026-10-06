import { LEADERBOARD_INACTIVE_DAYS, RETENTION_DAYS } from './retention';

/**
 * What the tool stores about a viewer, said once and used everywhere a viewer
 * might look: the `!datenschutz` answer in chat and the text for the Twitch
 * panel. The numbers come from retention.ts, so the sentence stays true when
 * the shelf life changes. Chat allows 500 characters; this stays under 400.
 */
export function privacySentence(): string {
  return `Dieser Kanal nutzt das Needless Streaming Tool. Es speichert auf dem Rechner des Streamers deinen Twitch-Namen mit deinen Einlösungen, Songwünschen und Vorschlägen: das Protokoll ${RETENTION_DAYS} Tage, die Zählung für die Bestenliste bis ${Math.round(LEADERBOARD_INACTIVE_DAYS / 30)} Monate nach deiner letzten Einlösung. Chat wird nicht gespeichert. Löschen auf Wunsch: schreib dem Streamer.`;
}

/** The same, as the block for the Twitch panel under the stream. */
export function privacyPanelBlock(): string {
  return ['Deine Daten', privacySentence()].join('\n');
}
