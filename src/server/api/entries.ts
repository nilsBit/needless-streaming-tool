import { Router } from 'express';
import { characterSource, isFailure, loadFromNotion, sendFailure } from './characters';
import {
  activeSince,
  characterArt,
  characterToEntry,
  clearActiveEntry,
  getActiveEntry,
  hiddenFieldsOf,
  pinEntry,
  setHiddenFields,
  toCard,
  type Entry,
} from './active-entry';
import { followStep } from './follow';
import { followState, MAX_SETTLE_SECONDS, updateFollow } from './follow-state';
import { loadArtenFromWorld, loadWorldEntries } from './worldbuilder';

/**
 * Entries: anything in the world, listed by Art, put on the Overlay, with the
 * per-field switch that keeps spoilers off stream, and Follow Mode.
 */

const router = Router();

const withHidden = (entry: Entry) => ({ ...entry, hidden: hiddenFieldsOf(entry.id) });

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** An Entry as the panel sends it back — the snapshot it got from the list. */
function readEntry(body: Record<string, unknown> | undefined): Entry | null {
  const id = text(body?.id)?.trim();
  const title = text(body?.title)?.trim();
  if (!body || !id || !title) return null;

  return {
    id,
    source: body.source === 'notion' ? 'notion' : 'worldbuilder',
    title,
    art: text(body.art)?.trim() ?? characterArt(),
    artColor: text(body.artColor),
    maturity: text(body.maturity),
    aliases: Array.isArray(body.aliases) ? body.aliases.filter((alias): alias is string => typeof alias === 'string') : [],
    text: text(body.text),
    fields: Array.isArray(body.fields)
      ? body.fields
          .filter((field): field is { name: string; value: string } =>
            typeof field?.name === 'string' && typeof field?.value === 'string')
          .map(({ name, value }) => ({ name, value }))
      : [],
    relations: Array.isArray(body.relations)
      ? body.relations
          .filter((relation): relation is { name: string; value: string } =>
            typeof relation?.name === 'string' && typeof relation?.value === 'string')
          .map(({ name, value }) => ({ name, value }))
      : [],
    image: text(body.image),
    world: text(body.world),
  };
}

// GET /arten — the Arten there are to pick from. Notion only knows characters.
router.get('/arten', async (_req, res) => {
  if (characterSource() !== 'worldbuilder') {
    res.json([{ name: characterArt(), color: null }]);
    return;
  }
  const arten = await loadArtenFromWorld();
  if (isFailure(arten)) { sendFailure(res, arten); return; }
  res.json(arten);
});

// GET /?art= — every Entry of one Art, each with its Hidden Fields.
router.get('/', async (req, res) => {
  const art = text(req.query.art)?.trim() ?? characterArt();

  if (characterSource() === 'worldbuilder') {
    const entries = await loadWorldEntries(art);
    if (isFailure(entries)) { sendFailure(res, entries); return; }
    res.json(entries.map(withHidden));
    return;
  }

  if (art !== characterArt()) { res.json([]); return; }
  const characters = await loadFromNotion();
  if (isFailure(characters)) { sendFailure(res, characters); return; }
  res.json(characters.map((character) => withHidden(characterToEntry(character, 'notion'))));
});

router.get('/active', (_req, res) => {
  const entry = getActiveEntry();
  res.json({ entry: entry ? withHidden(entry) : null, card: entry ? toCard(entry) : null, since: activeSince() });
});

// POST /active — a pick by hand, which also holds the card against Follow Mode.
router.post('/active', async (req, res) => {
  const entry = readEntry(req.body);
  if (!entry) {
    res.status(400).json({ error: 'entry_invalid', message: 'Ein Eintrag braucht id und title.' });
    return;
  }
  const pinned = await pinEntry(entry);
  res.json({ entry: withHidden(pinned), card: toCard(pinned) });
});

router.delete('/active', async (_req, res) => {
  await clearActiveEntry();
  res.json({ success: true });
});

// ---------- Follow Mode ----------

router.get('/follow', (_req, res) => {
  res.json(followState());
});

// POST /follow — { enabled?, held?, settleSeconds? }
router.post('/follow', (req, res) => {
  const { enabled, held, settleSeconds } = req.body ?? {};
  if ((enabled !== undefined && typeof enabled !== 'boolean') || (held !== undefined && typeof held !== 'boolean')) {
    res.status(400).json({ error: 'follow_invalid', message: 'enabled und held sind true oder false.' });
    return;
  }
  if (settleSeconds !== undefined && !(Number.isInteger(settleSeconds) && settleSeconds >= 0 && settleSeconds <= MAX_SETTLE_SECONDS)) {
    res.status(400).json({ error: 'settle_invalid', message: `Die Wartezeit liegt zwischen 0 und ${MAX_SETTLE_SECONDS} Sekunden.` });
    return;
  }
  res.json(updateFollow({ enabled, held, settleSeconds }));
});

// POST /follow/toggle-hold — the Stream Deck's one button.
router.post('/follow/toggle-hold', (_req, res) => {
  res.json(updateFollow({ held: !followState().held }));
});

// POST /follow/check — one look at Worldbuilder, the same one the server takes every second.
router.post('/follow/check', async (_req, res) => {
  res.json(await followStep());
});

// ---------- Hidden Fields ----------

// POST /:id/hidden — { fields } replaces which parts of this Entry stay off stream.
router.post('/:id/hidden', (req, res) => {
  const fields = req.body?.fields;
  if (!Array.isArray(fields) || !fields.every((field) => typeof field === 'string')) {
    res.status(400).json({ error: 'fields_invalid', message: 'fields ist eine Liste von Feldnamen.' });
    return;
  }
  res.json({ hidden: setHiddenFields(req.params.id, fields) });
});

export default router;
