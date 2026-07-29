# Overlay Customization: CSS Variables + Config UI

**Date:** 2026-04-17
**Status:** Approved

## Goal

Allow users to customize overlay appearance (colors, fonts, sizes) via UI without editing HTML. Global settings with per-overlay overrides. Overlays load config from API and inject CSS variables at runtime.

## Architecture

**Data flow:** Settings UI → `POST /api/overlay-config` → DB (`settings` table, key `overlay_config`) → Overlay fetches `GET /public/overlay-config` → injects CSS variables on `:root`

## Important Technical Constraints

### CSP Update Required
The current CSP on `/overlay` routes blocks external fonts. Update to:
```
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com
```

### Background Color: Hex + Opacity Slider
`<input type="color">` only supports hex. Since overlay backgrounds use `rgba()` with alpha, split into:
- `--color-bg` — hex color (`#0a0a0a`)
- `--color-bg-opacity` — opacity value (`0.92`)
Background then uses: `rgba(var(--color-bg-rgb), var(--color-bg-opacity))`

### Glow/Shadow Colors — RGB Variants
Box-shadow and text-shadow use `rgba(R,G,B,alpha)` with inline RGB components. To make glow effects respond to color changes, each color variable needs an `-rgb` companion:
- `--color-primary: #ff2d7b` + `--color-primary-rgb: 255 45 123`
- `--color-secondary: #00d4ff` + `--color-secondary-rgb: 0 212 255`
- `--color-accent: #39ff14` + `--color-accent-rgb: 57 255 20`

Usage in CSS: `text-shadow: 0 0 8px rgb(var(--color-primary-rgb) / 0.5)`

The UI only shows the hex picker; the RGB variant is auto-computed when saving.

### FOUC Prevention
Config loader hides overlay until config is applied:
```js
document.documentElement.style.visibility = 'hidden';
fetch(...)
  .then(config => { /* apply vars */ })
  .finally(() => { document.documentElement.style.visibility = 'visible'; });
```

## CSS Variables (9 user-facing + auto-computed companions)

**User-configurable (shown in UI):**

| Variable | Default | Description |
|----------|---------|-------------|
| `--color-primary` | `#ff2d7b` | Main accent color (hot pink) |
| `--color-secondary` | `#00d4ff` | Secondary color (cyan) |
| `--color-accent` | `#39ff14` | Accent/success color (neon green) |
| `--color-text` | `#ffffff` | Text color |
| `--color-bg` | `#0a0a0a` | Background color (hex) |
| `--color-bg-opacity` | `0.92` | Background opacity (slider 0–1) |
| `--color-bg-secondary` | `#0d0d0d` | Secondary background |
| `--font-display` | `'Bebas Neue', sans-serif` | Display/heading font |
| `--font-body` | `'Inter', sans-serif` | Body text font |
| `--font-size-base` | `14px` | Base font size |

**Auto-computed (set by config loader, not shown in UI):**

| Variable | Derived from | Purpose |
|----------|-------------|---------|
| `--color-primary-rgb` | `--color-primary` | For rgba() in shadows/glows |
| `--color-secondary-rgb` | `--color-secondary` | For rgba() in shadows/glows |
| `--color-accent-rgb` | `--color-accent` | For rgba() in shadows/glows |
| `--color-bg-rgb` | `--color-bg` | For rgba() background with opacity |

## Detailed Changes

### 1. CSS Variables in All 8 Builtin Overlays

Each overlay (`experiment`, `roulette`, `milestone`, `progress`, `todos`, `song`, `alerts`, `poll`) gets:

**a) CSS variable declarations** at the top of their `<style>` block:
```css
:root {
  --color-primary: #ff2d7b;
  --color-secondary: #00d4ff;
  --color-accent: #39ff14;
  --color-text: #ffffff;
  --color-bg: rgba(10,10,10,0.92);
  --color-bg-secondary: #0d0d0d;
  --font-display: 'Bebas Neue', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-size-base: 14px;
}
```

**b) Replace all hardcoded CSS values** with `var()` references:
- All `#ff2d7b` → `var(--color-primary)`
- All `#00d4ff` → `var(--color-secondary)`
- All `#39ff14` → `var(--color-accent)`
- All `#fff` / `#ffffff` text colors → `var(--color-text)`
- All `rgba(10,10,10,...)` backgrounds → `var(--color-bg)`
- All `#0d0d0d` backgrounds → `var(--color-bg-secondary)`
- All `'Bebas Neue'` → `var(--font-display)`
- All `'Inter'` → `var(--font-body)`
- Key font sizes relative to `var(--font-size-base)`

**c) Config loader script** added before existing `<script>`:
```js
(function() {
  var name = 'OVERLAY_NAME'; // replaced per overlay
  document.documentElement.style.visibility = 'hidden';

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return r + ' ' + g + ' ' + b;
  }

  fetch('http://localhost:4000/public/overlay-config')
    .then(function(r) { return r.json(); })
    .then(function(config) {
      var vars = Object.assign({}, config.global || {}, (config.overrides || {})[name] || {});
      var root = document.documentElement;

      Object.keys(vars).forEach(function(k) {
        root.style.setProperty(k, vars[k]);
      });

      // Auto-compute RGB companions for rgba() usage
      ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'].forEach(function(k) {
        if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
      });

      // Load custom fonts if changed
      var fonts = [vars['--font-display'], vars['--font-body']].filter(Boolean);
      if (fonts.length > 0) {
        var families = fonts.map(function(f) { return f.split(',')[0].replace(/'/g, '').trim(); });
        var link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=' + families.map(function(f) { return encodeURIComponent(f) + ':wght@400;600;700'; }).join('&') + '&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
    })
    .catch(function() {})
    .finally(function() {
      document.documentElement.style.visibility = 'visible';
    });
})();
```

**Defaults are unchanged** — without config, overlays look exactly as they do now.

### 2. Config API Endpoints

**New file:** `src/server/api/overlay-config.ts`

**Public endpoint:** `GET /public/overlay-config`
- Returns JSON stored in `settings` table (key: `overlay_config`)
- Default: `{ "global": {}, "overrides": {} }`
- No auth required (overlays need to access it)

**Auth endpoint:** `POST /api/overlay-config`
- Accepts: `{ "global": { "--color-primary": "#e67e22", ... }, "overrides": { "roulette": { "--color-primary": "#f39c12" } } }`
- Validates that keys are valid CSS variable names
- Stores as JSON in `settings` table

**Auth endpoint:** `DELETE /api/overlay-config`
- Resets config to defaults (deletes the settings row)

### 3. Server Integration

**Modify:** `src/server/index.ts`
- Import and register overlay-config router: `app.use('/api/overlay-config', overlayConfigRouter)`
- Add public endpoint: `GET /public/overlay-config`

### 4. Settings UI — Overlay Design Section

**Modify:** `src/renderer/src/panels/OverlaysPanel.tsx`

Add a new "Design" section (collapsible) with:

**Global Settings:**
- 5 color inputs (`<input type="color">`) for primary, secondary, accent, text, bg-secondary
- 1 color input + opacity slider (0–1) for background (hex + alpha separate)
- 2 font dropdowns with preset options:
  - `Bebas Neue, Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Oswald, Raleway, Playfair Display, Roboto Mono, Fira Code`
- 1 font-size slider (10px–24px, default 14px)
- Save button

**Per-Overlay Override:**
- Dropdown: "Select overlay to customize" (lists all 8 builtin overlays)
- Same controls as global, but only non-empty values are saved
- "Clear overrides" button per overlay
- Visual indicator which overlays have overrides

**Preview:**
- Existing iframe preview updates when clicking "Save"
- Add a "Refresh Preview" button next to save

**Reset:**
- "Reset all to defaults" button with confirmation

### 5. Available Font Options

Hardcoded list of Google Fonts that are known to work well for stream overlays:

```ts
const FONT_OPTIONS = [
  { value: "'Bebas Neue', sans-serif", label: 'Bebas Neue' },
  { value: "'Inter', sans-serif", label: 'Inter' },
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans' },
  { value: "'Lato', sans-serif", label: 'Lato' },
  { value: "'Montserrat', sans-serif", label: 'Montserrat' },
  { value: "'Poppins', sans-serif", label: 'Poppins' },
  { value: "'Oswald', sans-serif", label: 'Oswald' },
  { value: "'Raleway', sans-serif", label: 'Raleway' },
  { value: "'Playfair Display', serif", label: 'Playfair Display' },
  { value: "'Roboto Mono', monospace", label: 'Roboto Mono' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
];
```

### 6. Translation Keys (~15 new)

```
overlay_config.title — "Overlay Design" / "Overlay Design"
overlay_config.desc — "Farben und Schriften für alle Overlays anpassen." / "Customize colors and fonts for all overlays."
overlay_config.global — "Globale Einstellungen" / "Global Settings"
overlay_config.override — "Overlay-spezifisch" / "Overlay-specific"
overlay_config.select_overlay — "Overlay auswählen..." / "Select overlay..."
overlay_config.color_primary — "Primärfarbe" / "Primary color"
overlay_config.color_secondary — "Sekundärfarbe" / "Secondary color"
overlay_config.color_accent — "Akzentfarbe" / "Accent color"
overlay_config.color_text — "Textfarbe" / "Text color"
overlay_config.color_bg — "Hintergrund" / "Background"
overlay_config.color_bg_secondary — "Hintergrund (sekundär)" / "Background (secondary)"
overlay_config.font_display — "Überschrift-Font" / "Display font"
overlay_config.font_body — "Text-Font" / "Body font"
overlay_config.font_size — "Schriftgröße" / "Font size"
overlay_config.reset_all — "Alles zurücksetzen" / "Reset all"
overlay_config.clear_overrides — "Overrides entfernen" / "Clear overrides"
overlay_config.saved — "Design gespeichert" / "Design saved"
overlay_config.refresh — "Vorschau aktualisieren" / "Refresh preview"
```

## Affected Files

| Category | Files |
|----------|-------|
| Overlays (8) | All `src/overlays/*/index.html` — CSS variables + config loader |
| New API | `src/server/api/overlay-config.ts` |
| Server | `src/server/index.ts` — register routes + public endpoint |
| UI | `src/renderer/src/panels/OverlaysPanel.tsx` — Design section |
| CSS | `src/renderer/src/index.css` — color picker/font selector styles |
| i18n | `src/renderer/src/i18n/translations.ts` — ~18 new keys |

## What Does NOT Change

- Overlay HTML structure (only CSS values become variables)
- Custom overlay upload/override system
- WebSocket connections
- Template overlay (`_template/index.html`)
- Existing overlay functionality

## Risk

- Medium: touching all 8 overlay HTML files (CSS refactor)
- Low: API and UI are additive
- Key risk: CSS variable replacement must be thorough — missing a hardcoded value means that element won't respond to config changes
- Mitigation: defaults match current values, so partial migration still works
