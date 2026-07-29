# Dark-Theme Contrast & Layer Differentiation Redesign

## Context

NST's dark theme passes WCAG AAA on text-on-background contrast (text #fff on bg-body #0a0a0a is 19.7:1), but the UI reads as flat. User walked through the rendered app and CSS tokens and identified three concrete pain points:

- **A — Panels verschwimmen im Hintergrund.** `--bg-body #0a0a0a` and `--bg-panel #181818` differ by only ~3 stops. The `--border #383838` against `--bg-panel` is 1.4:1, near-invisible. Panels read as holes punched in the same dark sheet, not as discrete cards.
- **D — Hero-Panel Abgrenzung zu schwach.** Hero has a 2px accent border that works. Adjacent grid panels have a 1px #383838 border that doesn't. The visual hierarchy (Hero > Grid > Collapsed) is carried by layout only, not by contrast.
- **E — Pauschal alles flach.** Five background tokens live between #0a and #25 — there's no visible elevation system. Whole UI reads as one grey.

After comparing three visual directions (Elevation / Deep Void / Bold Borders), the user picked **Bold Borders** — separation by stroke, not by fill. The chosen treatment uses a single greyscale surface across body and panels, with visible borders carrying all the hierarchy work, and inputs that visually sink below the panel plane.

## Goals

- Layer hierarchy delivered by **border weight + color**, not by fill differentiation.
- Single greyscale surface (`#161616`) shared by body, panels, headers, internal cards.
- Inputs visibly sunken (`#0e0e0e`) below the panel plane.
- Border ramp from subtle (internal dividers) → default (panel boundary) → strong (inputs, button frames).
- Hero retains its accent border; bright orange remains the brand color.
- Hover lightens border one ramp step, plus fill shifts to `--bg-hover`.

## Non-Goals

- **Light theme is out of scope.** It has a separate pre-existing bug (`--bg-body` is never overridden, so 15 elements render as #0a0a0a in light mode). That bug is documented for a follow-up spec but **not fixed here** — the user works exclusively in dark theme.
- No JSX/component changes. CSS-only edit.
- No new motion / micro-animations / transition tuning.
- No changes to OBS browser-source overlays under `src/overlays/`. Those render outside the app shell and use their own visual language.
- No border-radius or typography changes.

## Token System

### Surface tokens (collapsed to a single greyscale plane)

| Token | Before | After | Role |
|---|---|---|---|
| `--bg-body` | `#0a0a0a` | `#161616` | Main app surface |
| `--bg-panel` | `#181818` | `#161616` | Same as body — separation is via border |
| `--bg-header` | `#151515` | `#1a1a1a` | App header bar — slightly darker as chrome |
| `--bg-card` | `#1e1e1e` | `#161616` | Internal cards, collapsed into bg-panel |
| `--bg-input` | `#1a1a1a` | `#0e0e0e` | **Sunken** below the panel surface |
| `--bg-hover` | `#252525` | `#1f1f1f` | Hover lift, subtle |

### Border tokens (the load-bearing change)

| Token | Before | After | Role |
|---|---|---|---|
| `--border-subtle` | _new_ | `#262626` | Internal dividers, collapsed row top edge, panel header underline |
| `--border` | `#383838` | `#3a3a3a` | Default panel boundary, 1.5px |
| `--border-strong` | `#444` (`--border-light`) | `#4a4a4a` | Inputs, internal cards, button frames |

`--border-light` is renamed to `--border-strong` for semantic clarity.

### Text tokens

| Token | Before | After | Role |
|---|---|---|---|
| `--text` | `#fff` | `#fff` | unchanged |
| `--text-secondary` | `#d0d0d0` | `#d0d0d0` | unchanged |
| `--muted` | `#bbb` | `#999` | Pulled back so emphasis lands on bordered structure |

### Accent (unchanged)

| Token | Value | Role |
|---|---|---|
| `--accent` | `#e67e22` | Brand orange — hero border, active tab text/border, primary action |

No `--accent-strong` introduced. Hero is just thicker (2px), not brighter.

## Element Treatment Rules

### Panels

- Default: `background: var(--bg-panel); border: 1.5px solid var(--border); border-radius: 8px`.
- Hero: `border: 2px solid var(--accent)` (already exists, kept).
- Collapsed row: `border: 1px solid var(--border-subtle); border-radius: 4px` — lighter weight to deprioritize.
- Internal panel divider (header bar underline): `border-bottom: 1px solid var(--border-subtle)`.

### Inputs

- `background: var(--bg-input); border: 1px solid var(--border-strong); color: var(--text)`.
- Focus: `border-color: var(--accent); outline: none`.

### Buttons (hover/active rule extension)

The Bold Borders aesthetic extends to all interactive elements. Three states:

| State | Border | Fill | Text |
|---|---|---|---|
| Default (inactive) | `transparent` (or `var(--border)` for framed buttons) | `transparent` | `var(--muted)` |
| Hover | `var(--border-strong)` | `var(--bg-hover)` | `var(--text)` |
| Active | `var(--accent)` | `rgba(230,126,34,0.15)` | `var(--accent)` |

Applies to: `.tab-btn`, `.area-btn`, `.s-card-action`, `.panel-collapse-btn`, `.btn-settings-*`, `.lang-btn`, `.hidden-bar-btn`, `.s-toggle-btn`.

### Internal cards (`.s-card`, `.settings-section`, `.overlay-item`)

- `background: var(--bg-panel)` (same as panel — no nested fill).
- `border: 1px solid var(--border-strong)`.
- Internal divider: `border-bottom: 1px solid var(--border-subtle)`.

### Chat panels and overlay previews

- `.chat-panel` and `.chat-iframe` wrapper: same panel border treatment.
- `.overlay-preview-frame`: `border: 1.5px solid var(--border); background: #000` (the preview interior stays black — it's a browser-source viewport).

### Modal overlays (`.ov2-modal` family)

- `background: var(--bg-panel); border: 1.5px solid var(--border-strong)` (modals get the strong border to lift them off the body without needing a fill shift).
- Backdrop overlay: existing rgba semitransparent black, unchanged.

## Rollout Scope (Option C — Full)

User chose the broadest scope. Affected stylesheet: `src/renderer/src/index.css` only. No other file edited.

### In scope

- App shell: `.app-header`, `.tab-nav`, `.area-nav`, `.panels` grid container
- Panel surfaces: `.panel`, `.hero-panel`, `.panel-wrapper`, `.panel-grid`, `.panel-collapsed-list`, `.panel-header-bar`
- Internal cards: `.s-card`, `.s-sidebar-btn`, `.settings-section`, `.overlay-item`, `.help-table-row`, `.vote-section`
- Inputs everywhere: `input`, `select`, `textarea`, `.s-card-inputs`, `.obs-mapping-row select`, `.obs-mapping-duration`
- Buttons: `.tab-btn`, `.area-btn`, `.s-card-action`, `.panel-collapse-btn`, `.pin-btn`, `.panel-header-btn`, `.btn-settings-ghost`, `.btn-settings-danger`, `.lang-btn`, `.hidden-bar-btn`, `.s-toggle-btn`, `.mock-button`
- Hidden-panels bar: `.hidden-bar`, `.hidden-bar-btn`
- Chat panels and overlay-preview wrappers: `.chat-panel`, `.chat-iframe`, `.overlay-preview-frame`
- Modal frames: `.ov2-modal`, `.ov2-modal-title`, `.ov2-modal-sub`, `.ov2-modal-hint`, `.ov2-modal-textarea`
- Hand-tuned hex literals throughout the file that bypassed tokens (e.g. `.panel-collapse-btn:hover { background: #222 }` → `var(--bg-hover)`; `.help-cell { color: #999 }` → `var(--muted)`; etc.)

### Out of scope

- Light theme overrides (`[data-theme="light"] …`) — left untouched. Pre-existing breakage stays as-is.
- OBS browser-source overlays in `src/overlays/*`
- Any TypeScript / React component file
- Database / API / server-side
- Print styles, if any

## Implementation Strategy

1. **Edit `:root` block first.** Replace the seven surface tokens, three border tokens, and `--muted`. This alone covers ~80% of the visual change because most rules already reference `var(--*)`.
2. **Sweep hard-coded hex literals.** Grep through `index.css` for hex codes that should be tokens. Known offenders:
   - `#222` (panel-collapse-btn hover, help-table-row border-bottom)
   - `#888`, `#999`, `#aaa`, `#666` (text colors that should be `--muted`)
   - `#eee`, `#fafafa` (light-theme — leave alone, out of scope)
   - `#444`, `#383838`, `#2a2a2a` (border-ish values that should map to the border ramp)
3. **Rename `--border-light` → `--border-strong`** at both the definition and the (currently zero) call sites. Add `--border-subtle` as new.
4. **Verify in real app** (user-driven, since dev server is owned by the user): walk Live → Produktion → Projekt → Settings → Overlays → Hilfe. Confirm hero pops, grid panels distinguishable, no remaining "flat" zones, modals lift off background.
5. **No code split / no migration.** CSS replacement is atomic; one commit.

## Verification

- `npm run typecheck` — should be no-op (CSS-only change). Run for safety.
- `npm run lint` — ESLint doesn't touch CSS. Run for safety.
- **Manual UI walk** (user): Live tab with hero + 2-col grid + collapsed row → check three distinct elevation reads; switch to Produktion → same; Settings tab → SettingsCard frames visible, inputs sunken; open OverlaysPanel modal → modal lifts cleanly; tab/area button hover → border brightens.
- No automated visual regression — out of scope for this project, and the panels' content is data-dependent.

## Risks

- **Hard-coded hex literals are scattered.** The CSS file is 2300+ lines. A token rename catches the variable uses, but inline hex (e.g. `.lang-btn.active { border-color: #e67e22 }`) won't move with the token. Grep sweep is needed; may miss one or two.
- **Specific section CSS (`.s-*`, `.ov2-*`, `.obs-mapping-*`) frequently uses inline hex.** These need explicit attention during the sweep.
- **Some legacy elements** (e.g. the `.help-table-row` styling under SettingsPanel) may look slightly different after `--muted` shifts from `#bbb` to `#999`. Acceptable — fixable in follow-up if it reads too dim.
- **Border-radius unchanged.** With the new tighter border palette, the existing 4px radius on some elements may feel slightly off; not addressed here to keep the change contained.

## Migration / Backwards Compatibility

None needed. CSS replacement only, no schema, no state, no API contracts. Reloading the renderer picks up the change immediately on the next Vite HMR.

## Open Questions / Follow-ups

- **Light-theme bg-body bug** — separate spec required. Multiple tokens (`--bg-body`, `--bg-card`, `--bg-hover`, `--muted`, `--border-light`/strong, `--border-subtle`) need light-theme values added.
- **Border-radius pass** — if the new tighter borders read as too "rectangular", a follow-up could drop 8px → 6px on panels and 4px → 3px on inputs.
- **Empty states + button disabled states** — out of scope here but flagged by the broader audit; would benefit from the new border ramp too.
- **OBS browser-source overlays** could eventually be aligned with the same token system, but they currently use a separate aesthetic by design (overlays are for stream viewers, not the operator).
