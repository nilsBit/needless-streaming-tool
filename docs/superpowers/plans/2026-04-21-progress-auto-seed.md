# Progress-Panel Auto-Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-seed das Progress-Panel beim ersten Mount mit 3 Beispiel-Items (Trello/Notion-Pattern), ersetze den toten Primary-CTA-Button durch einen Inline-Input im EmptyState.

**Architecture:** Frontend-only Änderung. Trigger im `ProgressPanel.tsx` via `useEffect`, idempotent durch Settings-Marker `progress_seeded_v1` und Backend-409-Schutz. `EmptyState`-Komponente bekommt einen `inlineInput`-Prop (rückwärtskompatibel). Backend (`/api/progress/seed-examples`, `/api/settings/get|set`) bleibt unverändert.

**Tech Stack:** React + TypeScript, bestehende `useApi`-Hooks, bestehender `EmptyState` aus UX-Foundation.

**Spec:** `docs/superpowers/specs/2026-04-21-progress-auto-seed-design.md`

**Convention note:** Dieses Projekt nutzt **keine automatisierten Tests** (siehe Slice-1-Konventionen). Verifikation per `npm run typecheck`, `npm run lint`, und manuellem QA. Frequent commits per Task.

---

### Task 1: EmptyState um `inlineInput`-Prop erweitern

**Files:**
- Modify: `src/renderer/src/components/ux/EmptyState.tsx`

- [ ] **Step 1: Prop-Interface erweitern**

Ersetze den kompletten `EmptyState.tsx`-Inhalt durch:

```tsx
import React from 'react';

export interface EmptyStateCta {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface EmptyStateInlineInput {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  buttonLabel?: string;
}

interface Props {
  icon: string;
  title: string;
  description?: string;
  cta?: EmptyStateCta;
  inlineInput?: EmptyStateInlineInput;
  secondaryCta?: EmptyStateCta;
  secondaryLeadIn?: string;
  size?: 'normal' | 'compact';
}

export default function EmptyState({ icon, title, description, cta, inlineInput, secondaryCta, secondaryLeadIn, size = 'normal' }: Props) {
  return (
    <div className={`ux-empty ${size === 'compact' ? 'compact' : ''}`}>
      <div className="ux-empty-icon" aria-hidden>{icon}</div>
      <div className="ux-empty-title">{title}</div>
      {description && <div className="ux-empty-desc">{description}</div>}
      {inlineInput ? (
        <div className="ux-empty-inline-input">
          <input
            type="text"
            value={inlineInput.value}
            onChange={(e) => inlineInput.onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') inlineInput.onSubmit(); }}
            placeholder={inlineInput.placeholder}
            autoFocus
          />
          <button onClick={inlineInput.onSubmit} disabled={!inlineInput.value.trim()}>
            {inlineInput.buttonLabel ?? '+'}
          </button>
        </div>
      ) : cta && (
        <button className="ux-empty-cta" onClick={cta.onClick} disabled={cta.disabled}>
          {cta.label}
        </button>
      )}
      {secondaryCta && (
        <div className="ux-empty-secondary-row">
          {secondaryLeadIn && <span className="ux-empty-lead">{secondaryLeadIn}</span>}
          <button className="ux-empty-secondary" onClick={secondaryCta.onClick} disabled={secondaryCta.disabled}>
            {secondaryCta.label}
          </button>
        </div>
      )}
    </div>
  );
}
```

Schlüsselpunkt: `inlineInput` wird **statt** `cta`-Button gerendert (Präzedenz wie im Spec). `secondaryCta` bleibt unabhängig.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ux/EmptyState.tsx
git commit -m "feat(ux): add inlineInput prop to EmptyState component"
```

---

### Task 2: CSS für `inlineInput` + Light-Overrides

**Files:**
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Styles direkt nach dem `.ux-empty-secondary:hover`-Block einfügen**

Suche im File: `.ux-empty-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.05); }`

Direkt **danach** (vor dem nächsten `[data-theme="light"] .ux-empty {`-Block) einfügen:

```css
.ux-empty-inline-input {
  display: flex;
  gap: 6px;
  width: 100%;
  max-width: 360px;
  margin-top: 4px;
}
.ux-empty-inline-input input {
  flex: 1;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.04);
  color: inherit;
  font-size: 13px;
}
.ux-empty-inline-input input:focus {
  outline: none;
  border-color: var(--accent, #4a9eff);
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
}
.ux-empty-inline-input button {
  padding: 9px 16px;
  border-radius: 8px;
  background: var(--accent, #4a9eff);
  color: white;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.ux-empty-inline-input button:hover:not(:disabled) { filter: brightness(1.1); }
.ux-empty-inline-input button:disabled { opacity: 0.4; cursor: not-allowed; }

[data-theme="light"] .ux-empty-inline-input input {
  background: var(--bg-input);
  border-color: var(--border);
  color: var(--text);
}
[data-theme="light"] .ux-empty-inline-input input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(230, 126, 34, 0.2);
}
```

- [ ] **Step 2: Optional Cleanup — alte `.kanban-add-empty`-Styles löschen**

Sie werden nach Task 4 nicht mehr verwendet. Suche und entferne diese Zeilen:

```css
.kanban-add-empty { max-width: 420px; margin: 12px auto 0 auto; display: flex; gap: 6px; }
.kanban-add-empty input { flex: 1; padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.03); color: inherit; font-size: 13px; }
.kanban-add-empty button { padding: 8px 14px; border-radius: 6px; background: rgba(255,255,255,0.08); color: inherit; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; }

[data-theme="light"] .kanban-add-empty input {
  background: var(--bg-input); border-color: var(--border); color: var(--text);
}
[data-theme="light"] .kanban-add-empty button {
  background: var(--bg-input); border-color: var(--border); color: var(--text);
}
[data-theme="light"] .kanban-add-empty button:hover:not(:disabled) { background: #eee; }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(ux): add inline-input styles for EmptyState + light overrides"
```

---

### Task 3: Auto-Seed-Logik in ProgressPanel

**Files:**
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`

- [ ] **Step 1: Imports erweitern**

Am Anfang von `ProgressPanel.tsx` den Import-Block für `useApi` ändern:

Suche: `import { useApi, apiPost, apiPatch, apiDelete, getApiToken } from '../hooks/useApi';`

Ersetze durch: `import { useApi, apiGet, apiPost, apiPatch, apiDelete, getApiToken } from '../hooks/useApi';`

Auch: `useRef` zum React-Import hinzufügen — suche `import React, { useState, useEffect } from 'react';` und ersetze durch `import React, { useState, useEffect, useRef } from 'react';`

- [ ] **Step 2: API_BASE und authHeaders importieren oder `apiPost`-Verhalten nutzen**

Wir brauchen den HTTP-Status, um zwischen 201 und 409 zu unterscheiden. `apiPost` versteckt das. Zwei Wege:

**Variante A (bevorzugt, kein neuer Helper):** Direkt `fetch` verwenden mit denselben Auth-Headers wie `apiPost`. Dafür müssen wir `getApiToken` nutzen (bereits importiert) und manuell den Header bauen.

**Variante B:** Neuen Helper `apiPostRaw` in `useApi.ts` hinzufügen, der den `Response` zurückgibt.

Wähle **Variante A** für minimalen Footprint. Code in nächstem Step.

- [ ] **Step 3: Auto-Seed `useEffect` direkt nach dem bestehenden `useWebSocket`-Block einfügen**

Suche im File:
```tsx
  useWebSocket((event) => {
    if (event.startsWith('progress-')) refetch();
  });
```

Direkt **danach** einfügen:

```tsx
  // Auto-seed 3 example items on first ever panel-mount when board is empty
  // (Trello/Notion-Pattern, see docs/superpowers/specs/2026-04-21-progress-auto-seed-design.md)
  const triedSeedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!data) return;
    if (data.items.length !== 0) return;
    if (triedSeedRef.current) return;

    triedSeedRef.current = true;

    (async () => {
      const marker = await apiGet<{ value: string | null }>('/settings/get/progress_seeded_v1');
      if (marker?.value === 'true') return;

      const token = getApiToken();
      const res = await fetch('http://localhost:4000/api/progress/seed-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      });

      if (res.status === 201) {
        await apiPost('/settings/set', { key: 'progress_seeded_v1', value: 'true' });
        refetch();
      } else if (res.status === 409) {
        // Defensive: items already exist (race), mark as seeded so we don't retry next mount
        await apiPost('/settings/set', { key: 'progress_seeded_v1', value: 'true' });
      } else {
        // Network/server error — silently allow retry on next mount
        triedSeedRef.current = false;
      }
    })();
  }, [loading, data, refetch]);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/panels/ProgressPanel.tsx
git commit -m "feat(progress): auto-seed example items on first panel-mount"
```

---

### Task 4: ProgressPanel EmptyState refaktorieren (Inline-Input statt CTA + separater Block)

**Files:**
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`

- [ ] **Step 1: EmptyState-Aufruf + folgenden `.kanban-add-empty`-Block ersetzen**

Suche im File:
```tsx
      {items.length === 0 ? (
        <>
          <EmptyState
            icon="📋"
            title={t('empty.kanban.title')}
            description={t('empty.kanban.desc')}
            cta={{ label: t('empty.kanban.cta'), onClick: () => {
              const el = document.getElementById('kanban-empty-input');
              if (el instanceof HTMLInputElement) el.focus();
            } }}
            secondaryLeadIn={t('empty.kanban.secondary_lead')}
            secondaryCta={{ label: t('empty.kanban.seed'), onClick: seedExamples }}
          />
          <div className="kanban-add kanban-add-empty">
            <input
              id="kanban-empty-input"
              type="text"
              placeholder={t('progress.item_placeholder')}
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
            />
            <button onClick={addItem}>+</button>
          </div>
        </>
      ) : (
```

Ersetze den `<EmptyState ... />` + den darauf folgenden `<div className="kanban-add kanban-add-empty">…</div>` (also alles innerhalb der `<>…</>`-Fragment) durch:

```tsx
      {items.length === 0 ? (
        <EmptyState
          icon="📋"
          title={t('empty.kanban.title')}
          description={t('empty.kanban.desc')}
          inlineInput={{
            value: newItem,
            onChange: setNewItem,
            onSubmit: addItem,
            placeholder: t('progress.item_placeholder'),
          }}
        />
      ) : (
```

Wichtig: das `<>…</>`-Fragment fällt komplett weg — nur noch `<EmptyState … />` direkt zwischen `{items.length === 0 ?` und `: (`.

- [ ] **Step 2: `seedExamples`-Funktion entfernen (wird nicht mehr verwendet)**

Suche im File und lösche:
```tsx
  const seedExamples = async () => {
    const result = await apiPost('/progress/seed-examples', {});
    if (!result) { toast.error(t('progress.seed_error')); return; }
    toast.success(t('progress.seed_success'));
    refetch();
  };
```

- [ ] **Step 3: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`
Expected: keine Fehler/Warnungen.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/panels/ProgressPanel.tsx
git commit -m "refactor(progress): inline empty-state input, drop dead primary CTA"
```

---

### Task 5: i18n-Cleanup (unbenutzte Keys entfernen)

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Verifizieren dass die Keys nirgends sonst benutzt werden**

Run: `grep -rn "empty.kanban.secondary_lead\|empty.kanban.seed\|empty.kanban.cta\|progress.seed_success\|progress.seed_error" src/renderer/src --include="*.tsx" --include="*.ts"`

Erwartung: nur Vorkommen in `translations.ts`. Falls woanders noch verwendet → STOPP, überprüfe & melde.

- [ ] **Step 2: Keys entfernen**

In `src/renderer/src/i18n/translations.ts` die folgenden Zeilen löschen:

```ts
  'empty.kanban.cta': { de: '➕ Erstes Feature anlegen', en: '➕ Create your first feature' },
  'empty.kanban.secondary_lead': { de: 'oder lass mich 3 Beispiele anlegen:', en: 'or let me create 3 examples:' },
  'empty.kanban.seed': { de: 'Beispiele einfügen', en: 'Insert examples' },
```

Und ebenfalls:
```ts
  'progress.seed_success': { de: '3 Beispiele angelegt. Du kannst sie anpassen oder löschen.', en: '3 examples created. You can edit or delete them.' },
  'progress.seed_error': { de: 'Konnte keine Beispiele einfügen.', en: 'Could not insert examples.' },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "chore(i18n): drop unused kanban empty-state and seed-toast keys"
```

---

### Task 6: Manuelles QA

**Files:** keine

- [ ] **Step 1: Fresh-State herstellen**

Stoppe `npm run dev` falls läuft. Dann:

```bash
mv data/stream.db data/stream.db.bak2 2>/dev/null
mv data/stream.db-shm data/stream.db-shm.bak2 2>/dev/null
mv data/stream.db-wal data/stream.db-wal.bak2 2>/dev/null
npm run dev
```

- [ ] **Step 2: QA-Pfad — Auto-Seed beim ersten Open**

1. App öffnet → Wizard durchklicken oder skippen
2. Progress-Panel öffnen
3. **Erwartung:** Sofort 3 Beispiel-Items in "To-Do"-Spalte sichtbar (🎨 Intro überarbeiten / 🔧 Overlay-Set erneuern / 🎮 Nächste Stream-Session planen). Kein Empty-State sichtbar.
4. DevTools → Network: Genau **ein** `POST /api/progress/seed-examples` (201) und **ein** `POST /api/settings/set` mit `progress_seeded_v1=true`.

- [ ] **Step 3: QA-Pfad — Refresh / Re-mount triggert nicht erneut**

1. Anderes Panel öffnen, dann zurück auf Progress.
2. App komplett neu laden (Ctrl+R).
3. **Erwartung:** Items sind weiterhin da, **kein** weiterer `seed-examples`-Call im Network-Tab.

- [ ] **Step 4: QA-Pfad — Alle löschen → bleibt leer**

1. Alle 3 Items löschen (X-Button auf jeder Card).
2. **Erwartung:** EmptyState erscheint mit Icon 📋, Titel, Beschreibung, **Inline-Input mit `+`-Button** (KEIN separater Input-Block darunter, KEIN "Beispiele einfügen"-Button).
3. Panel wechseln + zurück → bleibt leer (kein Re-Seed).

- [ ] **Step 5: QA-Pfad — Inline-Input funktioniert**

1. Text in Inline-Input eingeben → Enter ODER `+`-Button.
2. **Erwartung:** Item erscheint in "To-Do", Input wird geleert.
3. Bei leerem Input: `+`-Button ist disabled (grau).

- [ ] **Step 6: QA-Pfad — Light Mode**

1. Settings → Theme → Light.
2. Zurück zu Progress (mit leeren Items aus Schritt 4).
3. **Erwartung:** EmptyState lesbar, Input lesbar, Border + Focus-Ring sichtbar.

- [ ] **Step 7: QA-Pfad — Backup wiederherstellen**

```bash
rm data/stream.db data/stream.db-shm data/stream.db-wal 2>/dev/null
mv data/stream.db.bak2 data/stream.db
mv data/stream.db-shm.bak2 data/stream.db-shm 2>/dev/null
mv data/stream.db-wal.bak2 data/stream.db-wal 2>/dev/null
```

- [ ] **Step 8: Push**

Wenn alle QA-Schritte grün:

```bash
git push origin main
```

- [ ] **Step 9: Memory aktualisieren**

`memory/project_ux_overhaul_in_progress.md` ergänzen: Auto-Seed-Iteration committed & gepusht. Marker-Pattern (`progress_seeded_v1`) für künftige Panel-Auto-Seeds dokumentieren.

---

## Notes for Implementation

- **Convention:** Direkter Commit auf `main`, conventional commits (`feat:`, `refactor:`, `style:`, `chore:`).
- **No automated tests** — verifiziert per typecheck + lint + manuellem QA.
- **HMR-Verhalten:** Während dev kann ein doppelter Mount auftreten. Der `triedSeedRef` plus Backend-409 fängt das ab.
- **`apiGet` bei `/settings/get/<key>`:** Returns `{ value: string | null }` (siehe `useFirstTouch.ts` für Referenz).
- **Bei Network-Fail:** wir setzen `triedSeedRef.current = false` zurück — beim nächsten useEffect-Run (z.B. wenn `data` sich ändert) wird's wieder versucht. Pragmatisch: nicht aggressiv polling, aber auch kein Dead-End.
