# Progress-Panel Auto-Seed (Trello/Notion-Pattern)

**Datum:** 2026-04-21
**Slice:** UX-Overhaul Slice 1 (Iteration nach Task-12-QA)
**Vorgänger-Spec:** `docs/superpowers/specs/2026-04-20-ux-foundation-progress-todos-design.md`

## Problem

Während der manuellen QA von Slice 1 (Task 12) zeigte sich: der Empty-State des Progress-Panels hat einen toten Primary-CTA-Button. Klick auf "Erstes Feature anlegen" fokussiert nur ein darunter platziertes Input-Feld — visuell passiert nichts, der Button fühlt sich kaputt an.

Der zugrundeliegende Konflikt: Wir bieten einen **Empty-State mit zwei Wahlmöglichkeiten** ("manuell anlegen" oder "Beispiele einfügen") und erzwingen damit eine Entscheidung, bevor der User überhaupt das Panel verstanden hat. Research (UX-Catalog: "Pre-filled example rows", "Action-first onboarding") zeigt: das ist das **falsche Pattern** für non-technical End-User. Trello, Notion, Linear seeden bei Fresh-Install automatisch Beispielinhalte und lassen den User direkt darin arbeiten.

## Lösung — Auto-Seed bei erstem Panel-Open

Beim allerersten Mount des Progress-Panels (items leer + kein Settings-Marker gesetzt) werden die 3 Beispiel-Items automatisch geseedet. Der User landet direkt in einem vorgefüllten Board ohne Klick. Marker verhindert, dass Seeds wieder erscheinen wenn der User später bewusst alles löscht.

## Entwurf

### Trigger

In `ProgressPanel.tsx`, beim ersten Mount nachdem Items + Settings geladen sind:

```
wenn items.length === 0 && !settings.progress_seeded_v1 && !alreadyAttempted:
  await POST /api/progress/seed-examples
  await POST /api/settings { progress_seeded_v1: 'true' }
  refetch items
```

`alreadyAttempted` ist ein lokaler `useRef`-Flag, der innerhalb desselben Mount-Lifecycles doppelte Versuche verhindert (z.B. wenn `items` zwei Mal von `loaded:false` auf `loaded:true` springen sollte).

### Idempotenz

Drei Schutzschichten gegen doppeltes Seeden:

1. **Settings-Marker** `progress_seeded_v1` (settings table, Wert `'true'`) — gesetzt nach erfolgreichem Seed. Wird nie zurückgesetzt.
2. **Backend 409** — bestehender `POST /api/progress/seed-examples` gibt 409 zurück wenn `project_items` nicht leer ist. Bleibt unverändert.
3. **Local ref-flag** während Mount-Lifecycle gegen Render-Race.

Falls der Marker-Save fehlschlägt aber der Seed durchging: nächster Mount → 409 → wir setzen den Marker defensiv auch beim 409, damit das selbstheilend ist.

### Visuelles Verhalten

- **Beim ersten Open:** Kurzer Loading-Moment (~100ms lokal), dann erscheinen die 3 Cards in der "To-Do"-Spalte. Keine separate Empty-State-Anzeige.
- **Beispiel-Items:** Bestehende 3 aus dem `/seed-examples`-Endpoint (Intro überarbeiten, Sponsor-Anfrage, Stream-Outro), inkl. Sub-Todos.
- **Keine visuelle "Beispiel"-Markierung** (kein dashed Border, kein Tag). Items sehen aus wie echte User-Items → Trello-Pattern. Senkt Hemmschwelle, "es ist meins".

### Empty-State nach Löschen

Wenn der User später alle Items löscht, gilt: `items.length === 0` aber Marker ist gesetzt → kein Re-Seed. Der bestehende `EmptyState` wird gezeigt, aber **vereinfacht**:

- Secondary-CTA "Beispiele einfügen" + zugehöriger Lead-In **entfernt** (Marker verhindert eh, wäre tot)
- Primary-CTA-Button **entfernt**
- Stattdessen: Input direkt **in den EmptyState integriert** (löst auch den ursprünglichen toten-Button-Bug für diesen Fall)

### Komponenten-Änderung: `EmptyState.inlineInput`-Prop

Die `EmptyState`-Komponente bekommt einen neuen optionalen Prop:

```ts
inlineInput?: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  buttonLabel?: string;  // default '+'
}
```

Wenn gesetzt → rendert ein Input + Save-Button **statt** des Primary-CTA-Buttons. Visueller Stil analog zum bestehenden Sub-Todo-Add-Pattern. Bisheriger `cta`-Prop bleibt für andere Panels die Foundation nutzen — die Komponente bleibt also rückwärtskompatibel.

**Präzedenz:** Wenn beide `cta` und `inlineInput` gesetzt sind, gewinnt `inlineInput` (CTA-Button wird nicht gerendert). `secondaryCta` bleibt unabhängig nutzbar.

### Backend

Kein neuer Endpoint nötig. Beide existieren bereits:
- `POST /api/progress/seed-examples` (mit 409-Schutz)
- `GET /api/settings` und `POST /api/settings` für den Marker

Kein Schema-Change. Marker landet als String in der `settings`-key/value-Tabelle.

### Fehlerverhalten

- **Seed-Endpoint fehlschlägt** (Netzwerk/DB) → KEIN Marker setzen → nächster Mount versucht's nochmal. **Kein Toast** (silent retry; Toast würde User beim ersten Open verwirren).
- **Marker-Save fehlschlägt nach erfolgreichem Seed** → harmlos. Nächster Mount sieht items, kein Re-Seed-Versuch.
- **409 kommt zurück** (irgendein Race) → Marker trotzdem setzen.

### i18n-Aufräumen

- `empty.kanban.secondary_lead` und `empty.kanban.seed` werden nicht mehr verwendet → entfernen, falls keine anderen Panels sie referenzieren (grep verifizieren)
- `empty.kanban.cta`-Text bleibt (wird zwar im Code nicht mehr gerendert, aber falls künftig wieder ein CTA gebraucht wird)

## Out of Scope

- Auto-Seed für andere Panels (Clips, Songs, Issues, Milestones …) — Pattern wird hier etabliert, Application kommt panel-by-panel in eigenen Specs
- "Rewarded post-completion" Empty-State (delightful Illustration wenn alle Items erledigt)
- Sichtbare "Beispiel"-Markierung der Seed-Items (bewusst weggelassen, Trello-Pattern)
- Settings-UI um Seeds manuell zurückzusetzen (Power-User-Feature, nicht End-User-relevant)
- Seed-Inhalte editierbar machen oder konfigurierbar (3 Beispiele bleiben hardcoded im Endpoint)

## Konventionen

- Direkter Commit auf `main`, conventional commits
- Typecheck + lint + manuelles QA (kein automatisierter Test, wie restlicher Slice 1)
- Research-backed: "Pre-filled example rows", "Action-first onboarding" aus `memory/reference_ux_patterns_catalog.md`
- Versions-Suffix `_v1` am Marker → falls wir später Seeds ändern und gezielt re-seeden wollen, kann ein `_v2` ausgerollt werden

## Risiken & offene Punkte

- **`/api/settings`-POST-Pattern** muss bei Implementation kurz verifiziert werden (Wert als String 'true', oder boolean? Konsistenz mit existierenden Markern wie `ux_hint_seen_progress.activate_item`)
- **HMR-Doppelmount** beim Entwickeln → zwei seed-Calls in kurzem Abstand → 409 fängt's, harmlos
- **Race zwischen Items-Load und Settings-Load**: beide Hooks müssen `loaded === true` reporten bevor wir den Trigger feuern. Sicherstellen dass `useApi` einen `loaded`-State hat (sonst auf `data !== undefined` prüfen)
