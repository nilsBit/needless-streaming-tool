// The five building blocks a reward is made of and the templates per persona
// (spec 2026-10-14-belohnungen-bausteine). No stream type is ever chosen: the
// persona buttons only filter the templates.

export type Block = 'alert' | 'roulette' | 'scene' | 'timer' | 'sound';
export type Persona = 'kreativ' | 'gaming' | 'talk' | 'coding';

export interface BlockInfo { value: Block; title: string; text: string; icon: string; names: string[] }

export const BLOCKS: readonly BlockInfo[] = [
  { value: 'alert', title: 'Nur ein Alert', text: 'Eine Meldung im Stream – du reagierst darauf.', icon: 'M12 3a6 6 0 016 6v4l2 3H4l2-3V9a6 6 0 016-6zM10 19a2 2 0 004 0', names: ['Frage an mich', 'Licht aus', 'Hallo sagen'] },
  { value: 'roulette', title: 'Glücksrad drehen', text: 'Das Rad wählt ein Thema für dich.', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v9l6 4', names: ['Thema drehen', 'Schicksal', 'Rad!'] },
  { value: 'scene', title: 'Szene kurz zeigen', text: 'Für ein paar Sekunden eine andere Szene.', icon: 'M3 5h18v12H3zM8 21h8', names: ['Hände zeigen', 'Karte zeigen', 'Kamera groß'] },
  { value: 'timer', title: 'Timer starten', text: 'Eine Aufgabe mit Countdown im Bild.', icon: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z', names: ['Nur Pistole', 'Ohne Maus', 'Schwarz-Weiß'] },
  { value: 'sound', title: 'Ton abspielen', text: 'Ein Ton aus deinen Alert-Tönen.', icon: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z', names: ['Jumpscare', 'Trink was!', 'Applaus'] },
];

export interface RewardTemplate { key: string; persona: Persona; name: string; does: string; cost: number; block: Block; needsInput?: boolean; minutes?: number; feature?: string }

export const REWARD_TEMPLATES: readonly RewardTemplate[] = [
  { key: 'thema', persona: 'kreativ', name: 'Thema drehen', does: 'Das Glücksrad wählt, woran du als Nächstes arbeitest.', cost: 500, block: 'roulette', feature: 'rad' },
  { key: 'farbe', persona: 'kreativ', name: 'Farbe wählen', does: 'Der Zuschauer schreibt eine Farbe dazu.', cost: 300, block: 'alert', needsInput: true },
  { key: 'handicap', persona: 'gaming', name: 'Handicap: 5 Minuten', does: 'Eine Aufgabe mit Countdown im Bild.', cost: 1000, block: 'timer', minutes: 5 },
  { key: 'jumpscare', persona: 'gaming', name: 'Jumpscare', does: 'Ein Ton, der dich erschreckt.', cost: 400, block: 'sound' },
  { key: 'frage', persona: 'talk', name: 'Frage an mich', does: 'Der Zuschauer schreibt eine Frage dazu.', cost: 300, block: 'alert', needsInput: true },
  { key: 'trink', persona: 'talk', name: 'Trink was!', does: 'Ein Ton erinnert dich ans Trinken.', cost: 200, block: 'sound' },
  { key: 'feature', persona: 'coding', name: 'Feature-Wunsch', does: 'Der Zuschauer schreibt seinen Wunsch dazu.', cost: 500, block: 'alert', needsInput: true },
  { key: 'maus', persona: 'coding', name: '10 Minuten ohne Maus', does: 'Nur Tastatur – mit Countdown im Bild.', cost: 1500, block: 'timer', minutes: 10 },
];

export const PERSONAS: ReadonlyArray<{ value: Persona | 'alle'; label: string }> = [
  { value: 'alle', label: 'Alle' }, { value: 'kreativ', label: 'Kreativ' }, { value: 'gaming', label: 'Gaming' }, { value: 'talk', label: 'Talk' }, { value: 'coding', label: 'Coding' },
];

export const DURATIONS: readonly number[] = [1, 3, 5, 10];

/** Own points come slower than channel points: a template costs a tenth there, at least 10. */
export function templateCost(t: RewardTemplate, mode: 'points' | 'twitch'): number {
  return mode === 'points' ? Math.max(10, Math.round(t.cost / 10)) : t.cost;
}

/** What a block's alert looks like on stream, for the preview. */
export function streamPreview(block: Block, name: string, o: { minutes?: number; sound?: string | null; withText?: boolean }): string {
  if (block === 'timer') return `${name} · von Lena · ${(o.minutes ?? 5) - 1}:59`;
  if (block === 'sound') return `Lena · ${name}${o.sound ? ` – mit Ton „${o.sound.replace(/\.[a-z0-9]+$/i, '')}“` : ''}`;
  if (block === 'roulette') return 'Das Rad dreht sich und bleibt auf einem Thema stehen.';
  if (block === 'scene') return 'Die Szene läuft für die gewählte Zeit, dann kommt die vorige zurück.';
  return o.withText ? `Lena · ${name} – „…dein Text…“` : `Lena löst „${name}“ ein.`;
}
