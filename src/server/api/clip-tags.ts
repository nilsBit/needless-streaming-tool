import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

const router = Router();

const PRESET_TAGS: { tag: string; emoji: string; preset: true }[] = [
  { tag: 'highlight', emoji: '⭐', preset: true },
  { tag: 'fail', emoji: '💀', preset: true },
  { tag: 'funny', emoji: '😂', preset: true },
  { tag: 'tutorial', emoji: '📚', preset: true },
  { tag: 'bug', emoji: '🐛', preset: true },
];

const PRESET_TAG_NAMES = new Set(PRESET_TAGS.map((t) => t.tag));

function getCustomTags(): string[] {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('custom_clip_tags') as { value: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomTags(tags: string[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('custom_clip_tags', JSON.stringify(tags));
}

function getAllTags() {
  const custom = getCustomTags().map((tag) => ({ tag, emoji: '🏷️', preset: false as const }));
  return [...PRESET_TAGS, ...custom];
}

// GET all tags
router.get('/', (_req, res) => {
  res.json(getAllTags());
});

// POST add custom tag
router.post('/', (req, res) => {
  const { tag } = req.body;
  if (!tag || typeof tag !== 'string' || !tag.trim()) {
    res.status(400).json({ error: 'tag required' });
    return;
  }

  const normalized = tag.trim().toLowerCase();

  if (PRESET_TAG_NAMES.has(normalized)) {
    res.status(409).json({ error: 'Tag already exists as preset' });
    return;
  }

  const custom = getCustomTags();
  if (custom.includes(normalized)) {
    res.status(409).json({ error: 'Tag already exists' });
    return;
  }

  custom.push(normalized);
  saveCustomTags(custom);

  const allTags = getAllTags();
  broadcast('clip-tags-changed', allTags);
  res.status(201).json(allTags);
});

// DELETE custom tag
router.delete('/:tag', (req, res) => {
  const tagName = req.params.tag;

  if (PRESET_TAG_NAMES.has(tagName)) {
    res.status(400).json({ error: 'Cannot delete preset tag' });
    return;
  }

  const custom = getCustomTags();
  const index = custom.indexOf(tagName);
  if (index === -1) {
    res.status(404).json({ error: 'Tag not found' });
    return;
  }

  custom.splice(index, 1);
  saveCustomTags(custom);

  const allTags = getAllTags();
  broadcast('clip-tags-changed', allTags);
  res.status(200).json(allTags);
});

export default router;
