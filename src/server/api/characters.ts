import { Router, Response } from 'express';
import { loadCharactersFromWorld, loadWorld, loadWorldEntries } from './worldbuilder';
import {
  activeCharacter,
  activeSince,
  characterArt,
  characterToEntry,
  clearActiveEntry,
  getActiveEntry,
  pinEntry,
  toLegacyCharacter,
} from './active-entry';

/**
 * Characters are never authored here — they are read from Worldbuilder, the
 * desktop world-builder on this machine where this stream's world actually
 * gets written, and one of them is put on screen.
 *
 * Since the Overlay shows any Entry, a Character is just an Entry of the
 * character Art. These routes keep the character-shaped API that the Stream
 * Deck plugin and older overlays speak; the Active Entry behind them lives in
 * `active-entry.ts`.
 */

const router = Router();

export interface Character {
  id: string;
  name: string;
  role: string | null;
  status: string | null;
  summary: string | null;
  image: string | null;
}

/** Why a list could not be produced, in a form routes can map to HTTP. */
export type LoadFailure = { error: string; message?: string; status?: number };

export function isFailure<T>(result: T[] | LoadFailure): result is LoadFailure {
  return !Array.isArray(result);
}

/**
 * Something that is simply not there right now (503), or a Worldbuilder that
 * answered badly (502).
 *
 * Worldbuilder being closed is the first case on purpose. It is not a
 * misconfiguration and not a fault — it is a program that is not running, and
 * starting it is the whole remedy.
 */
const NOT_RIGHT_NOW = ['worldbuilder_not_running', 'worldbuilder_no_world', 'worldbuilder_timeout'];

export function sendFailure(res: Response, failure: LoadFailure): void {
  res.status(NOT_RIGHT_NOW.includes(failure.error) ? 503 : 502).json(failure);
}

// GET / — the characters of the open world
router.get('/', async (_req, res) => {
  const result = await loadCharactersFromWorld(characterArt());
  if (isFailure(result)) { sendFailure(res, result); return; }
  res.json(result);
});

/**
 * GET /source — which world Worldbuilder is currently attached to, and which
 * Art counts as characters.
 *
 * Worth its own route because picking characters out of the wrong world is a
 * mistake that only shows up on stream. The panel can name the world before
 * anything goes on screen.
 */
router.get('/source', async (_req, res) => {
  const world = await loadWorld();
  res.json({
    kind: characterArt(),
    world: 'name' in world ? world.name : null,
    ...('error' in world ? { error: world.error, message: world.message } : {}),
  });
});

router.get('/active', (_req, res) => {
  res.json({ character: activeCharacter(), since: activeSince() });
});

// POST /active — pin a character to the overlay. The client sends the whole
// character so the snapshot never needs a round trip to the source.
router.post('/active', async (req, res) => {
  const { id, name, role, status, summary, image } = req.body ?? {};
  if (typeof id !== 'string' || !id.trim()) {
    res.status(400).json({ error: 'id_required' });
    return;
  }
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name_required' });
    return;
  }
  const character: Character = {
    id: id.trim(),
    name: name.trim(),
    role: typeof role === 'string' ? role : null,
    status: typeof status === 'string' ? status : null,
    summary: typeof summary === 'string' ? summary : null,
    image: typeof image === 'string' ? image : null,
  };
  const pinned = await pinEntry(characterToEntry(character));
  res.json({ character: toLegacyCharacter(pinned) });
});

/**
 * POST /cycle — advance to the next character, wrapping at the end.
 *
 * Exists for the Stream Deck, which has one button and no way to pick from a
 * list. Deliberately takes no arguments: the button needs no configuration and
 * keeps working when characters are added or removed at the source.
 */
router.post('/cycle', async (_req, res) => {
  const result = await loadWorldEntries(characterArt());
  if (isFailure(result)) { sendFailure(res, result); return; }
  if (result.length === 0) {
    res.status(404).json({ error: 'no_characters' });
    return;
  }

  const active = getActiveEntry();
  const current = active ? result.findIndex((entry) => entry.id === active.id) : -1;
  // Unknown or absent current character starts the cycle at the top.
  const position = (current + 1) % result.length;
  const pinned = await pinEntry(result[position]);

  res.json({ character: toLegacyCharacter(pinned), position: position + 1, total: result.length });
});

router.delete('/active', async (_req, res) => {
  await clearActiveEntry();
  res.json({ success: true });
});

export default router;
