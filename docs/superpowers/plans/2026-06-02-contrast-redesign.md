# Dark-Theme Contrast Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch NST's dark theme from a flat fill-based palette to a Bold-Borders system where layer hierarchy is carried by visible borders, not by fill variation.

**Architecture:** Single-file CSS refactor. The `:root` token block is rewritten so most consumers pick up the change automatically. A targeted sweep then catches hand-tuned hex literals that bypassed the token system. Light-theme overrides remain untouched (pre-existing structural bug, out of scope).

**Tech Stack:** CSS custom properties. No build step changes, no library updates, no JSX touched.

**Spec:** `docs/superpowers/specs/2026-06-02-contrast-redesign-design.md`

---

## Reference Tables (used throughout the tasks)

### Token map

| Token | Before | After | Notes |
|---|---|---|---|
| `--bg-body` | `#0a0a0a` | `#161616` | |
| `--bg-panel` | `#181818` | `#161616` | Identical to body — separation via border |
| `--bg-header` | `#151515` | `#1a1a1a` | Slightly darker chrome |
| `--bg-card` | `#1e1e1e` | `#161616` | Collapsed into panel |
| `--bg-input` | `#1a1a1a` | `#0e0e0e` | **Sunken** below panel |
| `--bg-hover` | `#252525` | `#1f1f1f` | |
| `--border-subtle` | _(new)_ | `#262626` | Internal dividers |
| `--border` | `#383838` | `#3a3a3a` | Default panel border |
| `--border-strong` | `#444` (was `--border-light`) | `#4a4a4a` | Inputs, internal cards |
| `--muted` | `#bbb` | `#999` | Pulled back |
| `--text`, `--text-secondary`, `--accent` | unchanged | unchanged | |

### Hand-tuned hex → token mapping

When sweeping inline hex outside `[data-theme="light"]` blocks, use these substitutions:

| Hex literal | Replace with | Context |
|---|---|---|
| `#222` | `var(--bg-hover)` | Hover fill |
| `#444` | `var(--border-strong)` | Borders only — check it isn't a text color |
| `#383838` | `var(--border)` | Always border |
| `#2a2a2a` | `var(--border-subtle)` | Inner dividers |
| `#888`, `#999`, `#aaa` | `var(--muted)` | Always text |
| `#666` | `var(--muted)` if text, leave if dot/icon decoration | Check context |
| `#bbb` | `var(--muted)` | Always text |
| `#555` | `var(--muted)` | Always text |
| `#fff` | `var(--text)` if not on a colored bg | Leave on solid-colored buttons |

**Skip rule:** Do NOT replace hex inside `[data-theme="light"] …` selectors. Light theme is out of scope and has its own broken structure.

### Class family bindings

Every class touched maps to exactly one rule family:

| Family | Rule | Classes |
|---|---|---|
| Panel | 1.5px `var(--border)` solid, radius 8px, fill `var(--bg-panel)` | `.panel`, `.panel-wrapper`, `.hero-panel` (override → 2px accent) |
| Collapsed panel | 1px `var(--border-subtle)` solid, radius 4px | `.panel-wrapper.collapsed`, `.panel-collapsed-list > *` |
| Panel divider | `border-bottom: 1px solid var(--border-subtle)` | `.panel-header-bar` |
| App chrome | `var(--bg-header)` fill, `1.5px solid var(--border)` bottom | `.app-header`, `.tab-nav` separator |
| Button (3-state) | inactive: muted on transparent; hover: text on `--bg-hover`, border `--border-strong`; active: accent text + 15% accent fill + accent border | `.tab-btn`, `.area-btn`, `.s-card-action`, `.panel-collapse-btn`, `.pin-btn`, `.panel-header-btn`, `.btn-settings-ghost`, `.btn-settings-danger`, `.lang-btn`, `.hidden-bar-btn`, `.s-toggle-btn`, `.mock-button` |
| Input | `var(--bg-input)` fill, `1px solid var(--border-strong)` | `input`, `select`, `textarea`, `.s-card-inputs input`, `.obs-mapping-row select`, `.obs-mapping-duration`, `.ov2-modal-textarea` |
| Internal card | `var(--bg-panel)` fill, `1px solid var(--border-strong)`, inner divider `1px var(--border-subtle)` | `.s-card`, `.settings-section`, `.overlay-item`, `.vote-section` |
| Card row | `var(--bg-panel)` fill, hover lightens border one ramp step | `.s-sidebar-btn`, `.help-table-row` |
| Modal frame | `var(--bg-panel)` fill, `1.5px solid var(--border-strong)` | `.ov2-modal`, `.ov2-modal-sub`, `.ov2-modal-hint` |
| Iframe wrapper | `1.5px solid var(--border)`, interior bg `#000` | `.chat-panel`, `.chat-iframe` wrapper, `.overlay-preview-frame` |

---

## File Structure

Single file affected: `src/renderer/src/index.css` (2329 lines as of HEAD).

No new files, no deletions, no JSX touched.

---

## Task 1: Token system update

**Files:**
- Modify: `src/renderer/src/index.css:3-15` (`:root` block)

**Why first:** Most CSS rules already reference `var(--*)`. Updating the token block alone shifts the bulk of the visual change. Subsequent tasks then handle the rules that bypassed tokens.

- [ ] **Step 1: Confirm `--border-light` has zero call sites**

Run: `grep -n "border-light" src/renderer/src/index.css`
Expected: one line — the definition at line 11. No call sites means the rename is safe.

- [ ] **Step 2: Rewrite the `:root` block**

Replace lines 3-15 of `src/renderer/src/index.css` with:

```css
:root {
  --bg-body: #161616;
  --bg-header: #1a1a1a;
  --bg-panel: #161616;
  --bg-card: #161616;
  --bg-input: #0e0e0e;
  --bg-hover: #1f1f1f;
  --border-subtle: #262626;
  --border: #3a3a3a;
  --border-strong: #4a4a4a;
  --text: #fff;
  --text-secondary: #d0d0d0;
  --muted: #999;
  --accent: #e67e22;
}
```

- [ ] **Step 3: Verify build still passes**

Run: `npm run typecheck && npm run lint`
Expected: typecheck passes (CSS isn't typechecked), lint passes with 0 errors and 12 warnings (pre-existing).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(tokens): collapse surfaces to single grey, add border ramp

Move dark-theme to Bold-Borders system: bg-body, bg-panel, bg-card
collapse to #161616; bg-input sinks to #0e0e0e; new --border-subtle
#262626 + renamed --border-strong (was --border-light) #4a4a4a.
muted pulled back from #bbb to #999."
```

---

## Task 2: Panel + hero + collapsed treatment

**Files:**
- Modify: `src/renderer/src/index.css` — rules near lines 110-160 (hero, panel-grid, panel-collapsed-list), 371-410 (panel-wrapper), 419-432 (.panel)

- [ ] **Step 1: Locate all panel-surface rules**

Run: `grep -n "^\.panel\|^\.hero-panel\|^\.panel-wrapper\|^\.panel-header-bar\|^\.panel-collapsed\|^\.panel-grid" src/renderer/src/index.css`

Note the line numbers. Expected: `.panel-wrapper` at 371, `.panel` at 419, `.hero-panel` at 110.

- [ ] **Step 2: Update `.panel-wrapper`**

Find the existing `.panel-wrapper { ... }` block (around line 371). Make sure it has:

```css
.panel-wrapper {
  background: var(--bg-panel);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  /* keep any existing layout properties (display, gap, padding, etc.) */
}
```

Leave the `.panel-wrapper[data-panel="X"]` left-border-color rules (lines 377-389) untouched — those are decorative per-panel accents.

- [ ] **Step 3: Update `.hero-panel`**

The existing rule at line 110 uses `border: 2px solid var(--accent)` — confirm that and keep it. Change `background: var(--bg-panel)` if it isn't already.

- [ ] **Step 4: Update `.panel-collapsed-list .panel-wrapper.collapsed`**

Find around line 150. Override the default panel border down to:

```css
.panel-wrapper.collapsed {
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
}
```

- [ ] **Step 5: Update `.panel-header-bar`**

The header bar at the top of each panel. Ensure the divider to the body is:

```css
.panel-header-bar {
  /* keep existing layout */
  border-bottom: 1px solid var(--border-subtle);
}
```

- [ ] **Step 6: Hero internal divider**

`.hero-panel .panel-header-bar` (around line 116) — same `border-bottom: 1px solid var(--border-subtle)`.

- [ ] **Step 7: Check `.panels` and `.panel-grid` containers**

Run: `grep -n "^\.panels\s\|^\.panels\.\|^\.panel-grid\s" src/renderer/src/index.css`

These are layout-only containers (display/grid/gap/padding). If they only carry layout props, no edit needed — just confirm. If you find any `background`, `border`, or color literal, swap to tokens per the mapping table.

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(panels): bold-border treatment for panel, hero, collapsed

1.5px default border on .panel-wrapper, 2px accent on .hero-panel
(kept), 1px subtle border on collapsed rows. Internal panel-header
divider uses --border-subtle."
```

---

## Task 3: App shell + tab/area navigation

**Files:**
- Modify: `src/renderer/src/index.css:26-33` (app-header), `:40-81` (tab-nav, area-nav, tab-btn, area-btn)

- [ ] **Step 1: Update `.app-header`**

Find around line 26. Replace its `border-bottom` with `border-bottom: 1.5px solid var(--border);`. Keep the existing `background: var(--bg-header)` and padding.

- [ ] **Step 2: Apply 3-state button rule to `.tab-btn`**

Find at line 69. Replace the block plus the hover/active rules at lines 80-81 with:

```css
.tab-btn {
  padding: 8px 16px;
  font-size: 14px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.tab-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.tab-btn.active {
  color: var(--accent);
  background: rgba(230, 126, 34, 0.15);
  border-color: var(--accent);
}
```

The hex literal `#e67e2215` in the previous active rule becomes `rgba(230, 126, 34, 0.15)` for readability.

- [ ] **Step 3: Apply 3-state rule to `.area-btn`**

Find at line 48. Replace its rules (and hover/active at 60-61):

```css
.area-btn {
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 600;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.area-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.area-btn.active {
  color: var(--accent);
  background: rgba(230, 126, 34, 0.18);
  border-color: var(--accent);
}
```

(Area gets a slightly stronger active fill — 18% vs 15% — because it's a higher-level chrome element.)

- [ ] **Step 4: Update `.area-nav` separator**

Find around line 40. The right-side separator should use the new border token:

```css
.area-nav {
  /* keep existing display, gap, margin-right, padding-right */
  border-right: 1px solid var(--border);
}
```

- [ ] **Step 5: Check `.tab-nav` container**

Run: `grep -n "^\.tab-nav\s" src/renderer/src/index.css`

This should be layout-only (display: flex, gap). If you find any color/border/background literal, swap to tokens. Otherwise leave alone.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(nav): 3-state border treatment for tabs + area buttons

Hover lightens border to --border-strong, active uses solid accent
border + 15/18% accent fill. App header bottom upgraded to 1.5px
border. Replaces magic hex like #e67e2215 with explicit rgba."
```

---

## Task 4: Inputs + form fields

**Files:**
- Modify: `src/renderer/src/index.css` — wherever `input`, `select`, `textarea`, and form-related selectors live

- [ ] **Step 1: Find form-element selectors**

Run: `grep -n "^input\|^select\|^textarea\|^input," src/renderer/src/index.css`

Note: there's likely a generic `input, select, textarea { ... }` block. Find it.

- [ ] **Step 2: Update the generic input block**

Whatever rule applies to `input`, `select`, `textarea` globally, set:

```css
input, select, textarea {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text);
  /* keep existing padding, font-size, border-radius */
}

input:focus, select:focus, textarea:focus {
  border-color: var(--accent);
  outline: none;
}
```

- [ ] **Step 3: Update `.s-card-inputs` inputs and `.obs-mapping-*` controls**

Run: `grep -n "s-card-inputs\|obs-mapping-row select\|obs-mapping-duration\|ov2-modal-textarea" src/renderer/src/index.css`

For each, ensure they inherit the input treatment. If a rule overrides with a stale `background: #1a1a1a` or `border: 1px solid #383838`, swap it for the tokens.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(inputs): sink inputs below panel with strong border

input/select/textarea: --bg-input (#0e0e0e) fill, --border-strong
(#4a4a4a) 1px border, accent focus ring. Settings + OBS mapping +
modal textarea inherit."
```

---

## Task 5: All other buttons (3-state family)

**Files:**
- Modify: `src/renderer/src/index.css` — multiple button selectors scattered through the file

- [ ] **Step 1: List all button classes to touch**

The button family from the spec:
- `.s-card-action` (Settings card actions)
- `.panel-collapse-btn` (currently at line 391)
- `.pin-btn` (line 157)
- `.panel-header-btn`
- `.btn-settings-ghost`, `.btn-settings-danger`
- `.lang-btn` (around line 2284)
- `.hidden-bar-btn`
- `.s-toggle-btn`
- `.mock-button`

Find each with: `grep -n "^\.s-card-action\|^\.panel-collapse-btn\|^\.pin-btn\|^\.panel-header-btn\|^\.btn-settings\|^\.lang-btn\|^\.hidden-bar-btn\|^\.s-toggle-btn\|^\.mock-button" src/renderer/src/index.css`

Also check the `.hidden-bar` container itself: `grep -n "^\.hidden-bar\s" src/renderer/src/index.css`. If it has only layout props, leave it. If it carries a `background` or `border` literal, swap to tokens.

- [ ] **Step 2: For each, apply the 3-state rule**

The pattern (inactive / hover / active):

```css
.<class> {
  background: transparent;        /* or var(--bg-panel) for framed buttons */
  border: 1px solid transparent;  /* or var(--border) for framed */
  color: var(--muted);
  /* keep existing padding, font-size, border-radius */
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.<class>:hover {
  color: var(--text);
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.<class>.active,
.<class>.primary {
  color: var(--accent);
  background: rgba(230, 126, 34, 0.15);
  border-color: var(--accent);
}
```

Adjust per-class:
- **`.panel-collapse-btn:hover`** (line 405) currently uses `background: #222`. That becomes `var(--bg-hover)`. Also add `border-color: var(--border-strong)` per the new rule.
- **`.pin-btn:hover`** (line 166) currently only changes opacity. Add border lightening: `border-color: var(--border-strong)`.
- **`.lang-btn.active`** uses an inline hex literal `border-color: #e67e22; background: rgba(230, 126, 34, 0.1)`. Convert `#e67e22` to `var(--accent)`. Keep the rgba.
- **`.hidden-bar-btn:hover`** currently has `border-color: var(--muted)`. Per the new 3-state rule, change to `border-color: var(--border-strong)`.
- **`.btn-settings-ghost:hover`** uses `background: rgba(255,255,255,0.05); color: var(--text, #e0e0e0); border-color: rgba(255,255,255,0.2)`. Convert to the standard hover triple (`--bg-hover`, `--text`, `--border-strong`).
- **`.btn-settings-danger`** keeps its red accent — only change the hover/disabled border to `--border-strong`, leave the red intact.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(buttons): unify 3-state border treatment across all buttons

All button classes (settings, panel header, pin, lang, hidden-bar,
toggle, mock) now follow: muted text/transparent border default,
text + bg-hover + border-strong on hover, accent text + 15% accent
fill + accent border when active. Magic hex literals replaced with
tokens or explicit rgba."
```

---

## Task 6: Internal cards + card rows

**Files:**
- Modify: `src/renderer/src/index.css` — `.s-card`, `.settings-section` (line 613), `.overlay-item`, `.vote-section` (line 561), `.s-sidebar-btn`, `.help-table-row` (around line 2266)

- [ ] **Step 1: Update `.s-card`**

Run: `grep -n "^\.s-card\b" src/renderer/src/index.css` to locate.

Set to:
```css
.s-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  /* keep padding, margin, etc. */
}
```

If the file has `.s-card .header { border-bottom: ... }` or similar internal dividers, switch them to `var(--border-subtle)`.

- [ ] **Step 2: Update `.settings-section`**

Around line 613. Match the same treatment:
```css
.settings-section {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  /* existing padding etc */
}
.settings-section h3 {
  color: var(--accent);
  /* existing typography */
}
```

The `border-left-color: rgba(0,0,0,0.1)` light-theme override (line 704) stays untouched (out of scope).

- [ ] **Step 3: Update `.overlay-item`**

Run: `grep -n "^\.overlay-item" src/renderer/src/index.css`. Apply the card treatment.

- [ ] **Step 4: Update `.vote-section`** (line 561)

Currently: `padding: 8px; background: var(--bg-body); border-radius: 4px;`

Change to:
```css
.vote-section {
  padding: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
}
```

- [ ] **Step 5: Update `.s-sidebar-btn` (card-row treatment)**

Run: `grep -n "^\.s-sidebar-btn" src/renderer/src/index.css`. This is treated as a row: subtle bottom border, hover lifts.

```css
.s-sidebar-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--muted);
  /* keep padding etc */
}
.s-sidebar-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-subtle);
  color: var(--text);
}
.s-sidebar-btn.active {
  color: var(--accent);
  background: rgba(230, 126, 34, 0.1);
  border-color: var(--accent);
}
```

- [ ] **Step 6: Update `.help-table-row`** (line 2266)

Currently uses `border-bottom: 1px solid #222`. Change to `var(--border-subtle)`.

```css
.help-table-row {
  /* existing layout */
  border-bottom: 1px solid var(--border-subtle);
}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(cards): consistent border-strong frame for internal cards

.s-card, .settings-section, .overlay-item, .vote-section all carry
the new --border-strong (#4a4a4a) frame on --bg-panel fill. Help
table rows get --border-subtle dividers, sidebar buttons get the
card-row hover treatment."
```

---

## Task 7: Modal frames + chat + overlay previews

**Files:**
- Modify: `src/renderer/src/index.css` — `.ov2-modal*` (around line 1630), `.chat-panel` (line 2301), `.overlay-preview-frame` (line 2297)

- [ ] **Step 1: Update `.ov2-modal` family**

Run: `grep -n "^\.ov2-modal" src/renderer/src/index.css`.

For the dark-theme rules (NOT the `[data-theme="light"] .ov2-*` ones), apply:

```css
.ov2-modal {
  background: var(--bg-panel);
  border: 1.5px solid var(--border-strong);
  border-radius: 8px;
  /* keep existing layout */
}
.ov2-modal-sub {
  background: var(--bg-input);
  color: var(--muted);
  /* etc */
}
.ov2-modal-hint {
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  color: var(--muted);
}
.ov2-modal-textarea {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text);
}
```

For `.ov2-modal-title`: this is typography-only (font-size, color). If its color is a hex literal like `#fff` and the rule lives in the dark-theme block (not under `[data-theme="light"]`), convert to `var(--text)`. Otherwise leave alone.

Light-theme overrides at line 1630-1634 stay untouched.

- [ ] **Step 2: Update `.chat-panel` / `.chat-iframe`**

Line 2301:
```css
.chat-panel {
  min-height: 500px;
  background: var(--bg-panel);
  border: 1.5px solid var(--border);
  border-radius: 8px;
}
.chat-iframe {
  /* keep size + radius */
  border: none;
}
```

- [ ] **Step 3: Update `.overlay-preview-frame`** (line 2297)

```css
.overlay-preview-frame {
  background: #000;            /* intentional — viewport for actual overlay */
  border-radius: 6px;
  overflow: hidden;
  border: 1.5px solid var(--border);
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(modals,chat,preview): unify borders for floating surfaces

Modals lift via 1.5px --border-strong; chat panel + overlay
preview iframe wrappers use --border. Modal sub/hint/textarea
sink into --bg-input. Light-theme blocks untouched (out of scope)."
```

---

## Task 8: Hand-tuned hex sweep + final verification

**Files:**
- Modify: `src/renderer/src/index.css` — anywhere a stale hex literal remains

This task catches everything earlier tasks missed by sweeping the file for known-stale hex values.

- [ ] **Step 1: Find remaining stale hex values OUTSIDE light theme**

Run a series of greps, paying attention to surrounding `[data-theme="light"]` context. The `-B 5` flag gives 5 lines of context above each match to identify if the line lives inside a light-theme block:

```bash
grep -nB 5 "#888\|#999\|#aaa\|#666\|#bbb\|#555\|#ccc" src/renderer/src/index.css | grep -v "data-theme" | head -40
grep -nB 5 "#222\|#444\|#383838\|#2a2a2a\|#1e1e1e\|#252525\|#ddd" src/renderer/src/index.css | grep -v "data-theme" | head -40
```

Skip `#ddd` matches that are inside `[data-theme="light"]` blocks. Same for `#eee` and `#fafafa` if they appear — those are intentional light-theme literals and out of scope.

- [ ] **Step 2: For each match outside `[data-theme="light"]`, apply the hex→token mapping**

Use the Hand-tuned hex → token mapping table at the top of this plan. Edit each occurrence in place. Typical examples:

- `.help-cell { color: #999 }` → `color: var(--muted)`
- `.help-cell-key { color: #ccc }` → `color: var(--text-secondary)`
- `.help-table-row { border-bottom: 1px solid #222 }` → already handled in Task 6; verify
- `.panel-desc { color: #555 }` (line 431) → `var(--muted)`
- `.panel h3 { color: #666 }` (line 432) → `var(--muted)`
- Anything else that surfaces.

**Skip:** Light-theme blocks, `#000` (intentional black backgrounds like overlay-preview-frame interior), `#fff` on solid-colored buttons (accent fills), the per-panel `data-panel="X"` decorative left-border colors.

- [ ] **Step 3: Verify the final file builds**

Run: `npm run typecheck && npm run lint`
Expected: typecheck clean, lint clean (0 errors, 12 pre-existing warnings).

- [ ] **Step 4: Visual confirmation by user**

The dev server (started by the user) hot-reloads on save. Ask the user to walk through:

1. **Live tab:** hero panel pops with 2px orange border; grid panels (Glücksrad, Reward Stats, Now Playing, OBS Scenes) each have a visible 1.5px grey border; collapsed row at bottom has subtle 1px border.
2. **Produktion tab:** Clips panel as hero (or first panel) framed.
3. **Projekt tab:** Progress + Stats panels with consistent borders.
4. **Settings tab:** Settings panel cards (Twitch, OBS, Notion, GitHub, etc.) each in their own framed card; inputs visibly sunken into a darker grey.
5. **Hilfe tab:** help table rows separated by subtle dividers; key cells readable.
6. **Hover any tab/area button:** border lightens, fill shifts.
7. **Click into a SettingsPanel modal (Notion DB picker):** modal lifts off background with strong border.

If the user spots a "still flat" zone or wrong color, capture the selector and add a follow-up step (or fix inline).

- [ ] **Step 5: Final commit (only if Step 2 produced edits)**

```bash
git add src/renderer/src/index.css
git commit -m "style(sweep): replace remaining hand-tuned hex with tokens

Sweep finds remaining literals (#222, #555, #666, #999, etc.)
outside light-theme blocks and binds them to --muted / --bg-hover
/ --border-subtle / etc. Light-theme blocks intentionally
untouched per spec."
```

---

## Out-of-Scope Reminders

- **Light theme** stays broken. Pre-existing bug where `--bg-body` is never overridden produces ~15 elements rendering as the new `#161616` (same as dark, but light theme users will see black-on-white text contrast still works coincidentally because text is dark on light bg in light theme; but inputs, hovers, headers will look wrong). Tracked in spec's "Open Questions / Follow-ups".
- **OBS browser-source overlays** under `src/overlays/` use their own CSS and visual language. Not touched.
- **JSX / component code** unchanged. No `App.tsx`, no panel components.
- **Database / API / server** unchanged.

---

## Risks & Notes

- **Per-panel decorative left-borders** (`.panel-wrapper[data-panel="X"] { border-left-color: #colorXYZ }`) at lines 377-389 stay. They're the colored vertical strips identifying each panel and are intentional.
- **Magic accent hex** like `rgba(230, 126, 34, 0.15)` — kept as literals because computing accent-with-alpha from `var(--accent)` requires CSS color-mix() which isn't worth the browser-support discussion here.
- **Border-radius** stays at existing values (6px / 8px / 4px). If the new tighter borders make corners look off, a follow-up spec can address it.
- **HMR may need a full reload** if the user has very stale state. `Cmd+R` in the renderer window after the commits land.
