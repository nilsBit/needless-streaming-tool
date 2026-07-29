# Overlay Customization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSS variable customization to all 8 overlays with a config API and settings UI for colors, fonts, and sizes.

**Architecture:** New API endpoint stores overlay config as JSON in settings table. Each overlay gets CSS variable declarations + a config loader script that fetches and injects custom values. UI in OverlaysPanel provides color pickers, font dropdowns, and size slider. Global settings with per-overlay overrides.

**Tech Stack:** Express API, SQLite (settings table), React, HTML/CSS/JS overlays

**Spec:** `docs/superpowers/specs/2026-04-17-overlay-customization-design.md`

---

### Task 1: API endpoint + translation keys + CSP update

**Files:**
- Create: `src/server/api/overlay-config.ts`
- Modify: `src/server/index.ts`
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Create overlay-config API router**

Create `src/server/api/overlay-config.ts`:

```ts
import { Router } from 'express';
import { getDb } from '../db/index';

const router = Router();

const VALID_KEYS = new Set([
  '--color-primary', '--color-secondary', '--color-accent',
  '--color-text', '--color-bg', '--color-bg-opacity', '--color-bg-secondary',
  '--font-display', '--font-body', '--font-size-base',
]);

function getConfig(): { global: Record<string, string>; overrides: Record<string, Record<string, string>> } {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('overlay_config') as { value: string } | undefined;
  if (!row) return { global: {}, overrides: {} };
  try {
    return JSON.parse(row.value);
  } catch {
    return { global: {}, overrides: {} };
  }
}

function validateVars(vars: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (VALID_KEYS.has(k) && typeof v === 'string') {
      clean[k] = v;
    }
  }
  return clean;
}

// Auth endpoint: save config
router.post('/', (req, res) => {
  const { global, overrides } = req.body;
  const config = {
    global: global ? validateVars(global) : {},
    overrides: {} as Record<string, Record<string, string>>,
  };
  if (overrides && typeof overrides === 'object') {
    for (const [name, vars] of Object.entries(overrides)) {
      const cleaned = validateVars(vars as Record<string, string>);
      if (Object.keys(cleaned).length > 0) {
        config.overrides[name] = cleaned;
      }
    }
  }
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('overlay_config', JSON.stringify(config));
  res.json({ success: true });
});

// Auth endpoint: get config
router.get('/', (_req, res) => {
  res.json(getConfig());
});

// Auth endpoint: reset config
router.delete('/', (_req, res) => {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('overlay_config');
  res.json({ success: true });
});

export default router;

// Exported for inline public endpoint
export { getConfig };
```

- [ ] **Step 2: Register routes + CSP update in server/index.ts**

Read `src/server/index.ts` first. Make these changes:

1. Add import:
```ts
import overlayConfigRouter, { getConfig as getOverlayConfig } from './api/overlay-config';
```

2. Register auth route (after other `/api/` routes):
```ts
app.use('/api/overlay-config', overlayConfigRouter);
```

3. Add public endpoint (next to other `/public/` endpoints):
```ts
app.get('/public/overlay-config', (_req, res) => {
  res.json(getOverlayConfig());
});
```

4. Update CSP header (line ~56) to allow Google Fonts:
```ts
res.setHeader('Content-Security-Policy',
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src ws://localhost:4000 http://localhost:4000"
);
```

- [ ] **Step 3: Add translation keys**

Add to `src/renderer/src/i18n/translations.ts` before `} as const;`:

```ts
// ---- Overlay Config ----
'overlay_config.title': { de: 'Overlay Design', en: 'Overlay Design' },
'overlay_config.desc': { de: 'Farben und Schriften für alle Overlays anpassen.', en: 'Customize colors and fonts for all overlays.' },
'overlay_config.global': { de: 'Globale Einstellungen', en: 'Global Settings' },
'overlay_config.override': { de: 'Overlay-spezifisch', en: 'Overlay-specific' },
'overlay_config.select_overlay': { de: 'Overlay auswählen...', en: 'Select overlay...' },
'overlay_config.color_primary': { de: 'Primärfarbe', en: 'Primary color' },
'overlay_config.color_secondary': { de: 'Sekundärfarbe', en: 'Secondary color' },
'overlay_config.color_accent': { de: 'Akzentfarbe', en: 'Accent color' },
'overlay_config.color_text': { de: 'Textfarbe', en: 'Text color' },
'overlay_config.color_bg': { de: 'Hintergrund', en: 'Background' },
'overlay_config.color_bg_secondary': { de: 'Hintergrund (sekundär)', en: 'Background (secondary)' },
'overlay_config.bg_opacity': { de: 'Hintergrund-Transparenz', en: 'Background opacity' },
'overlay_config.font_display': { de: 'Überschrift-Font', en: 'Display font' },
'overlay_config.font_body': { de: 'Text-Font', en: 'Body font' },
'overlay_config.font_size': { de: 'Schriftgröße', en: 'Font size' },
'overlay_config.reset_all': { de: 'Alles zurücksetzen', en: 'Reset all' },
'overlay_config.clear_overrides': { de: 'Overrides entfernen', en: 'Clear overrides' },
'overlay_config.saved': { de: 'Design gespeichert', en: 'Design saved' },
'overlay_config.refresh': { de: 'Vorschau aktualisieren', en: 'Refresh preview' },
```

- [ ] **Step 4: Commit**

```bash
git add src/server/api/overlay-config.ts src/server/index.ts src/renderer/src/i18n/translations.ts
git commit -m "feat(overlay): add config API, CSP update, and translation keys"
```

---

### Task 2: CSS variable refactor — all 8 overlays

**Files:**
- Modify: `src/overlays/experiment/index.html`
- Modify: `src/overlays/todos/index.html`
- Modify: `src/overlays/progress/index.html`
- Modify: `src/overlays/milestone/index.html`
- Modify: `src/overlays/song/index.html`
- Modify: `src/overlays/alerts/index.html`
- Modify: `src/overlays/poll/index.html`
- Modify: `src/overlays/roulette/index.html`

- [ ] **Step 1: Add CSS variables + config loader to each overlay**

For EVERY overlay file, make these changes:

**a) Add `:root` CSS variables** at the very start of the `<style>` block (after `<style>` tag):
```css
:root {
  --color-primary: #ff2d7b;
  --color-secondary: #00d4ff;
  --color-accent: #39ff14;
  --color-text: #ffffff;
  --color-bg: #0a0a0a;
  --color-bg-opacity: 0.92;
  --color-bg-secondary: #0d0d0d;
  --color-primary-rgb: 255 45 123;
  --color-secondary-rgb: 0 212 255;
  --color-accent-rgb: 57 255 20;
  --color-bg-rgb: 10 10 10;
  --font-display: 'Bebas Neue', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-size-base: 14px;
}
```

**b) Replace hardcoded CSS values** throughout the file:

Color replacements (apply to ALL overlays):
- `#ff2d7b` → `var(--color-primary)` (everywhere except inside rgba)
- `#00d4ff` → `var(--color-secondary)` (everywhere except inside rgba)
- `#39ff14` → `var(--color-accent)` (everywhere except inside rgba)
- `#fff` / `#ffffff` / `#e0e0e0` (text colors) → `var(--color-text)`
- `#0d0d0d` → `var(--color-bg-secondary)`
- `rgba(10,10,10,0.9X)` backgrounds → `rgb(var(--color-bg-rgb) / var(--color-bg-opacity))`

For rgba glow/shadow colors:
- `rgba(255,45,123,X)` → `rgb(var(--color-primary-rgb) / X)`
- `rgba(0,212,255,X)` → `rgb(var(--color-secondary-rgb) / X)`
- `rgba(57,255,20,X)` → `rgb(var(--color-accent-rgb) / X)`

Font replacements:
- `'Bebas Neue', sans-serif` → `var(--font-display)` (in font-family declarations)
- `'Inter', sans-serif` → `var(--font-body)` (in font-family declarations)
- body `font-family: 'Inter', sans-serif` → `font-family: var(--font-body)`

**c) Add config loader script** BEFORE the existing `<script>` tag in each overlay:

```html
<script>
(function() {
  var name = 'OVERLAY_NAME_HERE';
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
      Object.keys(vars).forEach(function(k) { root.style.setProperty(k, vars[k]); });
      ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'].forEach(function(k) {
        if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
      });
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
    .finally(function() { document.documentElement.style.visibility = 'visible'; });
})();
</script>
```

Replace `OVERLAY_NAME_HERE` with the overlay's name:
- `experiment` for experiment/index.html
- `todos` for todos/index.html
- `progress` for progress/index.html
- `milestone` for milestone/index.html
- `song` for song/index.html
- `alerts` for alerts/index.html
- `poll` for poll/index.html
- `roulette` for roulette/index.html

**NOTE:** The `body { background: transparent !important; }` must stay as-is (this is for OBS transparency, NOT the overlay background). Only replace `rgba(10,10,10,...)` backgrounds on `.banner`, `.header-bar`, `.nfs-box`, and similar overlay containers.

**NOTE:** Do NOT touch the `@keyframes` animation names or the `transform: skewX()` values — only replace color values within them.

**NOTE:** Leave `#000` and `#555` and other grays that aren't part of the color scheme untouched.

- [ ] **Step 2: Commit**

```bash
git add src/overlays/
git commit -m "feat(overlay): add CSS variables and config loader to all 8 overlays"
```

---

### Task 3: Overlay Design UI in OverlaysPanel

**Files:**
- Modify: `src/renderer/src/panels/OverlaysPanel.tsx`
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Add Overlay Design section to OverlaysPanel**

Read `src/renderer/src/panels/OverlaysPanel.tsx` first. Add a new collapsible "Overlay Design" section with:

**State:**
```tsx
const [overlayConfig, setOverlayConfig] = useState<{
  global: Record<string, string>;
  overrides: Record<string, Record<string, string>>;
}>({ global: {}, overrides: {} });
const [selectedOverride, setSelectedOverride] = useState<string>('');
const [configLoading, setConfigLoading] = useState(true);
```

**Load config on mount:**
```tsx
useEffect(() => {
  apiFetch('/overlay-config').then(r => r.json()).then(data => {
    setOverlayConfig(data);
    setConfigLoading(false);
  }).catch(() => setConfigLoading(false));
}, []);
```

**Save function:**
```tsx
const saveConfig = async () => {
  const result = await apiPost('/overlay-config', overlayConfig);
  if (!result) { toast.error(t('error.action_failed')); return; }
  toast.success(t('overlay_config.saved'));
};
```

**Reset function:**
```tsx
const resetConfig = async () => {
  try {
    await apiFetch('/overlay-config', { method: 'DELETE' });
    setOverlayConfig({ global: {}, overrides: {} });
    toast.success(t('overlay_config.saved'));
  } catch { toast.error(t('error.action_failed')); }
};
```

**Helper to update a config value:**
```tsx
const updateGlobal = (key: string, value: string) => {
  setOverlayConfig(prev => ({
    ...prev,
    global: { ...prev.global, [key]: value },
  }));
};

const updateOverride = (overlay: string, key: string, value: string) => {
  setOverlayConfig(prev => ({
    ...prev,
    overrides: {
      ...prev.overrides,
      [overlay]: { ...(prev.overrides[overlay] || {}), [key]: value },
    },
  }));
};
```

**Font options constant:**
```tsx
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

const OVERLAY_NAMES = ['experiment', 'todos', 'progress', 'milestone', 'song', 'alerts', 'poll', 'roulette'];
```

**Color input helper component** (inline in the file):
```tsx
function ColorRow({ label, value, defaultValue, onChange }: { label: string; value?: string; defaultValue: string; onChange: (v: string) => void }) {
  return (
    <div className="config-row">
      <label>{label}</label>
      <input type="color" value={value || defaultValue} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
```

**Render the Design section** (add after existing overlay sections, before the preview section):

```tsx
<div className="overlay-section">
  <h3>{t('overlay_config.title')}</h3>
  <p className="setup-info">{t('overlay_config.desc')}</p>

  {/* Global Settings */}
  <h4>{t('overlay_config.global')}</h4>
  <div className="config-grid">
    <ColorRow label={t('overlay_config.color_primary')} value={overlayConfig.global['--color-primary']} defaultValue="#ff2d7b" onChange={v => updateGlobal('--color-primary', v)} />
    <ColorRow label={t('overlay_config.color_secondary')} value={overlayConfig.global['--color-secondary']} defaultValue="#00d4ff" onChange={v => updateGlobal('--color-secondary', v)} />
    <ColorRow label={t('overlay_config.color_accent')} value={overlayConfig.global['--color-accent']} defaultValue="#39ff14" onChange={v => updateGlobal('--color-accent', v)} />
    <ColorRow label={t('overlay_config.color_text')} value={overlayConfig.global['--color-text']} defaultValue="#ffffff" onChange={v => updateGlobal('--color-text', v)} />
    <ColorRow label={t('overlay_config.color_bg')} value={overlayConfig.global['--color-bg']} defaultValue="#0a0a0a" onChange={v => updateGlobal('--color-bg', v)} />
    <ColorRow label={t('overlay_config.color_bg_secondary')} value={overlayConfig.global['--color-bg-secondary']} defaultValue="#0d0d0d" onChange={v => updateGlobal('--color-bg-secondary', v)} />

    <div className="config-row">
      <label>{t('overlay_config.bg_opacity')}</label>
      <input type="range" min="0" max="1" step="0.05" value={overlayConfig.global['--color-bg-opacity'] || '0.92'} onChange={e => updateGlobal('--color-bg-opacity', e.target.value)} />
      <span>{overlayConfig.global['--color-bg-opacity'] || '0.92'}</span>
    </div>

    <div className="config-row">
      <label>{t('overlay_config.font_display')}</label>
      <select value={overlayConfig.global['--font-display'] || "'Bebas Neue', sans-serif"} onChange={e => updateGlobal('--font-display', e.target.value)}>
        {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
    </div>

    <div className="config-row">
      <label>{t('overlay_config.font_body')}</label>
      <select value={overlayConfig.global['--font-body'] || "'Inter', sans-serif"} onChange={e => updateGlobal('--font-body', e.target.value)}>
        {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
    </div>

    <div className="config-row">
      <label>{t('overlay_config.font_size')}</label>
      <input type="range" min="10" max="24" step="1" value={parseInt(overlayConfig.global['--font-size-base'] || '14')} onChange={e => updateGlobal('--font-size-base', e.target.value + 'px')} />
      <span>{overlayConfig.global['--font-size-base'] || '14px'}</span>
    </div>
  </div>

  {/* Per-Overlay Override */}
  <h4>{t('overlay_config.override')}</h4>
  <select value={selectedOverride} onChange={e => setSelectedOverride(e.target.value)}>
    <option value="">{t('overlay_config.select_overlay')}</option>
    {OVERLAY_NAMES.map(name => (
      <option key={name} value={name}>
        {name} {overlayConfig.overrides[name] ? '(*)' : ''}
      </option>
    ))}
  </select>

  {selectedOverride && (
    <div className="config-grid" style={{ marginTop: '12px' }}>
      <ColorRow label={t('overlay_config.color_primary')} value={overlayConfig.overrides[selectedOverride]?.['--color-primary']} defaultValue={overlayConfig.global['--color-primary'] || '#ff2d7b'} onChange={v => updateOverride(selectedOverride, '--color-primary', v)} />
      <ColorRow label={t('overlay_config.color_secondary')} value={overlayConfig.overrides[selectedOverride]?.['--color-secondary']} defaultValue={overlayConfig.global['--color-secondary'] || '#00d4ff'} onChange={v => updateOverride(selectedOverride, '--color-secondary', v)} />
      <ColorRow label={t('overlay_config.color_accent')} value={overlayConfig.overrides[selectedOverride]?.['--color-accent']} defaultValue={overlayConfig.global['--color-accent'] || '#39ff14'} onChange={v => updateOverride(selectedOverride, '--color-accent', v)} />
      <button className="btn-reset-small" onClick={() => {
        setOverlayConfig(prev => {
          const next = { ...prev, overrides: { ...prev.overrides } };
          delete next.overrides[selectedOverride];
          return next;
        });
      }}>{t('overlay_config.clear_overrides')}</button>
    </div>
  )}

  <div className="config-actions" style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
    <button className="btn-connect" onClick={saveConfig}>{t('settings.save')}</button>
    <button className="btn-reset-small" onClick={resetConfig}>{t('overlay_config.reset_all')}</button>
  </div>
</div>
```

- [ ] **Step 2: Add CSS for config grid**

Append to `src/renderer/src/index.css`:
```css
/* Overlay Config */
.config-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.config-row label {
  flex: 0 0 180px;
  font-size: 13px;
}

.config-row input[type="color"] {
  width: 40px;
  height: 30px;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  padding: 2px;
}

.config-row input[type="range"] {
  flex: 1;
  max-width: 200px;
}

.config-row select {
  flex: 1;
  max-width: 200px;
}

.config-row span {
  font-size: 12px;
  color: #888;
  min-width: 40px;
}

.config-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/panels/OverlaysPanel.tsx src/renderer/src/index.css
git commit -m "feat(overlay): add overlay design customization UI"
```

---

### Task 4: Typecheck + verification

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 3: Verify overlay config endpoint works**

Start the app with `npm run dev`, then:
- Open `http://localhost:4000/public/overlay-config` — should return `{"global":{},"overrides":{}}`
- In the app, go to Settings → Overlays → Overlay Design
- Change a color and save
- Refresh `http://localhost:4000/public/overlay-config` — should show the saved color
- Open an overlay preview — should show the custom color

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "feat(overlay): fix remaining overlay customization issues"
```
