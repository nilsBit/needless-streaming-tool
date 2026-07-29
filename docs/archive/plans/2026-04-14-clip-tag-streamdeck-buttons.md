# Clip Tag Stream Deck Buttons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-tag clip buttons to the Stream Deck plugin — 5 fixed preset buttons plus a configurable "Custom Clip" button — backed by a new clip-tags API and UI for managing custom tags.

**Architecture:** New `clip-tags` API route reads preset tags from a hardcoded array and custom tags from the `settings` table (`custom_clip_tags` key, JSON string array). The ClipsPanel UI is extended with custom tag management. The Stream Deck plugin gets 6 clip actions in its manifest (5 preset + 1 custom with Property Inspector).

**Tech Stack:** TypeScript, Express, React, SQLite (existing `settings` table), Elgato Stream Deck SDK v2

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/server/api/clip-tags.ts` | Create | API routes: GET/POST/DELETE clip tags |
| `src/server/index.ts` | Modify | Mount new `clip-tags` router |
| `src/renderer/src/panels/ClipsPanel.tsx` | Modify | Show custom tags, add/delete UI |
| `src/renderer/src/index.css` | Modify | Styles for custom tag delete button and add-tag input |

Stream Deck plugin files are out of scope for this plan — they depend on the plugin project being scaffolded first (see `docs/superpowers/plans/2026-04-13-streamdeck-plugin.md`). This plan covers the backend API and frontend UI that the plugin will consume.

---

### Task 1: Create the clip-tags API route

**Files:**
- Create: `src/server/api/clip-tags.ts`

- [ ] **Step 1: Create `src/server/api/clip-tags.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/server/api/clip-tags.ts
git commit -m "feat: add clip-tags API route (GET/POST/DELETE)"
```

---

### Task 2: Mount the clip-tags router in the server

**Files:**
- Modify: `src/server/index.ts:17,98`

- [ ] **Step 1: Add the import**

At line 17, after `import clipsRouter from './api/clips';`, add:

```typescript
import clipTagsRouter from './api/clip-tags';
```

- [ ] **Step 2: Mount the route**

At line 98, after `app.use('/api/clips', clipsRouter);`, add:

```typescript
app.use('/api/clip-tags', clipTagsRouter);
```

- [ ] **Step 3: Verify the server starts**

Run: `npm run dev`

Open: `http://localhost:4000/api/clip-tags?token=<your-token>`

Expected: JSON array with 5 preset tags.

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: mount clip-tags API route"
```

---

### Task 3: Extend ClipsPanel to show and manage custom tags

**Files:**
- Modify: `src/renderer/src/panels/ClipsPanel.tsx`

- [ ] **Step 1: Add ClipTag interface and state for custom tags**

At the top of the file, after the `TAG_EMOJI` definition (line 20), add:

```typescript
interface ClipTag {
  tag: string;
  emoji: string;
  preset: boolean;
}
```

- [ ] **Step 2: Load custom tags and add state for new tag input**

Inside `ClipsPanel()`, after the existing `useState` declarations (around line 35), add:

```typescript
const { data: clipTags, refetch: refetchTags } = useApi<ClipTag[]>('/clip-tags');
const [newTagName, setNewTagName] = useState('');
const [showNewTagInput, setShowNewTagInput] = useState(false);
```

- [ ] **Step 3: Update the WebSocket handler to refresh tags**

Change the existing `useWebSocket` call from:

```typescript
useWebSocket((event) => {
  if (event.startsWith('clip-')) { refetchClips(); refetchSessions(); }
});
```

To:

```typescript
useWebSocket((event) => {
  if (event.startsWith('clip-')) { refetchClips(); refetchSessions(); }
  if (event === 'clip-tags-changed') { refetchTags(); }
});
```

- [ ] **Step 4: Add helper functions for custom tag management**

After the `toggleDay` function, add:

```typescript
const addCustomTag = async () => {
  const trimmed = newTagName.trim().toLowerCase();
  if (!trimmed) return;
  await apiPost('/clip-tags', { tag: trimmed });
  setNewTagName('');
  setShowNewTagInput(false);
  refetchTags();
};

const deleteCustomTag = async (tag: string) => {
  await apiDelete(`/clip-tags/${tag}`);
  refetchTags();
};
```

- [ ] **Step 5: Build the combined tag list for display**

After the helper functions, add:

```typescript
const customTags = clipTags?.filter((t) => !t.preset) || [];
const allTagNames = [...PRESET_TAGS, ...customTags.map((t) => t.tag)];
```

- [ ] **Step 6: Update the tag buttons section in JSX**

Replace the existing `<div className="clip-tags">` block (lines 95-105) with:

```tsx
<div className="clip-tags">
  {PRESET_TAGS.map((tag) => (
    <button
      key={tag}
      className={`tag-btn ${activeFilter === tag ? 'active' : ''}`}
      onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
    >
      {TAG_EMOJI[tag] || '🏷️'} {tag}
    </button>
  ))}
  {customTags.map((ct) => (
    <button
      key={ct.tag}
      className={`tag-btn ${activeFilter === ct.tag ? 'active' : ''}`}
      onClick={() => setActiveFilter(activeFilter === ct.tag ? null : ct.tag)}
    >
      🏷️ {ct.tag}
      <span className="tag-delete" onClick={(e) => { e.stopPropagation(); deleteCustomTag(ct.tag); }}>✕</span>
    </button>
  ))}
  {showNewTagInput ? (
    <span className="tag-add-input">
      <input
        type="text"
        placeholder="Tag name..."
        value={newTagName}
        onChange={(e) => setNewTagName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') addCustomTag();
          if (e.key === 'Escape') { setShowNewTagInput(false); setNewTagName(''); }
        }}
        autoFocus
      />
      <button onClick={addCustomTag}>✓</button>
    </span>
  ) : (
    <button className="tag-btn tag-add" onClick={() => setShowNewTagInput(true)}>+</button>
  )}
</div>
```

- [ ] **Step 7: Update the select dropdown to include custom tags**

Replace the `<select>` inside `<div className="clip-custom">` (line 108-110) with:

```tsx
<select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
  {allTagNames.map((t) => <option key={t} value={t}>{t}</option>)}
</select>
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/panels/ClipsPanel.tsx
git commit -m "feat: custom clip tag management in ClipsPanel"
```

---

### Task 4: Add CSS for custom tag UI elements

**Files:**
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Add styles after the existing `.tag-btn.active` rule (around line 650)**

```css
.tag-btn .tag-delete {
  margin-left: 6px;
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.15s;
}
.tag-btn:hover .tag-delete { opacity: 0.7; }
.tag-btn .tag-delete:hover { opacity: 1; color: #e74c3c; }

.tag-btn.tag-add {
  border-style: dashed;
  color: #888;
}
.tag-btn.tag-add:hover { color: #e67e22; border-color: #e67e22; }

.tag-add-input {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.tag-add-input input {
  width: 100px;
  padding: 5px 8px;
  font-size: 13px;
}
.tag-add-input button {
  padding: 5px 8px;
  font-size: 13px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style: custom clip tag button styles"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test the clip tags API**

Open browser or use curl:
- `GET /api/clip-tags` → should return 5 preset tags
- `POST /api/clip-tags` with `{ "tag": "rage-quit" }` → should return 6 tags, last one has `preset: false`
- `POST /api/clip-tags` with `{ "tag": "rage-quit" }` → should return 409
- `POST /api/clip-tags` with `{ "tag": "highlight" }` → should return 409
- `POST /api/clip-tags` with `{ "tag": "" }` → should return 400
- `DELETE /api/clip-tags/rage-quit` → should return 5 tags
- `DELETE /api/clip-tags/bug` → should return 400
- `DELETE /api/clip-tags/nonexistent` → should return 404

- [ ] **Step 3: Test the UI**

In the app's Clips panel:
- Verify the 5 preset tag buttons show as before
- Click `+`, type a tag name, press Enter → new tag button appears
- Click the new tag button → it filters clips
- Hover the new tag → `✕` appears, click it → tag removed
- Open the clip dropdown → custom tags appear in the list
- Create a clip with the custom tag → it works

- [ ] **Step 4: Test WebSocket sync**

Open two browser windows with the app. Add a custom tag in one window → it should appear in the other window without refresh.

- [ ] **Step 5: Run type check**

Run: `npm run typecheck`
Expected: No errors.
