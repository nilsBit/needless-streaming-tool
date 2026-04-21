# Progress-Panel Guided Tour (Duolingo-Style)

**Datum:** 2026-04-21
**Vorgänger-Spec:** `docs/superpowers/specs/2026-04-21-progress-auto-seed-design.md`

## Problem

Der Progress-Tracker hat bereits Auto-Seed, EmptyState, TryThisBadge und Toast-Hints — aber keinen geführten Einstieg. Neue User sehen ein Board mit Beispiel-Items und müssen selbst herausfinden, wie Aktivieren, Sub-Tasks und der Overlay-Flow zusammenhängen. Ein interaktives Tutorial wie bei Duolingo führt den User Schritt für Schritt durch echte Aktionen.

## Lösung — Guided Tour mit Spotlight-Overlay

Ein "Tour starten"-Button im Progress-Header startet eine 5-Step-Tour. Jeder Step zeigt ein Spotlight-Overlay (dunkler Hintergrund, Ziel-Element ausgeschnitten) mit Tooltip-Bubble und wartet auf eine echte User-Aktion bevor es weitergeht. Der Button bleibt sichtbar bis die Tour komplett durchlaufen wurde.

## Entwurf

### Generische `<GuidedTour>` Komponente

Neue Datei: `src/renderer/src/components/ux/GuidedTour.tsx`

```ts
interface TourStep {
  targetSelector: string;    // CSS-Selector zum Ziel-Element
  title: string;             // Headline im Tooltip
  text: string;              // Erklärungstext
  waitFor: string;           // Event-Name der den Step abschließt
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right'; // Default: 'bottom'
}

interface GuidedTourProps {
  steps: TourStep[];
  onComplete: () => void;    // Wird aufgerufen wenn alle Steps durch
  onSkip: () => void;        // Wird aufgerufen bei "Überspringen"
}
```

**Rendering:**
- React Portal via `createPortal(jsx, document.body)` — erster Portal-Einsatz in der Codebase
- Fullscreen dunkles Overlay mit `z-index: 9000`
- Ziel-Element wird per `document.querySelector(targetSelector)` gefunden
- `getBoundingClientRect()` liefert Position → Highlight via `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)` auf einem Highlight-Element über dem Target
- Tooltip-Bubble neben dem Ausschnitt positioniert, `z-index: 9001` (unter Toast-Container `z-index: 9999`, damit Toasts immer sichtbar bleiben)
- Step-Indikator ("2/5") und "Überspringen"-Link im Tooltip
- Escape-Taste schließt die Tour (ruft `onSkip` auf)

**Target-Element nicht im DOM:**
- Wenn `querySelector` für den aktuellen Step `null` liefert, pollt die Komponente per `requestAnimationFrame`-Loop (max 2 Sekunden). Sobald das Element erscheint → Spotlight positionieren.
- Falls nach 2 Sekunden immer noch nicht da → Tour automatisch abbrechen (`onSkip`), kein Crash.
- Das ist relevant für Step 4 (`.sub-todo-add input` erscheint erst nach Auto-Expand) und Step 5 (`.sub-todo-check` erscheint erst nach Todo-Erstellung).

**Step-Fortschritt:**
- Komponente akzeptiert `currentEvent: string | null` als Prop (kein `useImperativeHandle` — bleibt konsistent mit dem Props-basierten Pattern der Codebase)
- ProgressPanel setzt `setTourEvent('item-created')` in den Handlern, GuidedTour reagiert per `useEffect` auf Änderungen
- Wenn `currentEvent` zum aktuellen Step's `waitFor` passt → nächster Step, dann `currentEvent` zurücksetzen (Callback `onEventConsumed`)
- Letzter Step → `onComplete()`

**Repositionierung:**
- `ResizeObserver` auf `document.body` + `scroll`-Listener auf `window` um Highlight + Tooltip bei Layout-Änderungen neu zu positionieren (z.B. wenn ein Item expandiert wird und der Content shiftet)

**Defensiv — Item gelöscht während Tour:**
- Wenn der User das gerade erstellte Item löscht während Steps 3-5 laufen, findet `querySelector` das Target nicht mehr → Tour bricht nach 2s Polling automatisch ab (wie oben). Button bleibt sichtbar für Neustart.

### Tour-Steps

| # | targetSelector | title (de) | text (de) | waitFor |
|---|---|---|---|---|
| 1 | `.kanban-board` | "Dein Kanban-Board" | "Hier verwaltest du deine Features und Tasks. Drei Spalten: Backlog, Aktiv, Erledigt." | `tour-acknowledged` |
| 2 | `.kanban-column:first-child .kanban-add input` | "Erstelle dein erstes Item" | "Gib einen Namen ein und drücke Enter." | `item-created` |
| 3 | `.kanban-column:first-child .kanban-item:last-child .status-toggle` | "Aktiviere es" | "Klicke auf das Symbol um das Item zu starten. Der Timer läuft dann mit." | `item-activated` |
| 4 | `.kanban-item.expanded .sub-todo-add input` | "Füge eine Sub-Task hinzu" | "Sub-Tasks erscheinen live im Overlay. Gib eine ein und drücke Enter." | `todo-created` |
| 5 | `.kanban-item.expanded .sub-todo-check` | "Hake sie ab" | "Geschafft! So trackst du deinen Fortschritt live on-stream." | `todo-checked` |

Step 1 ist der einzige passive Step — ein "Verstanden"-Button im Tooltip löst `tour-acknowledged` aus. Ab Step 2 wartet die Tour auf echte User-Aktionen.

Nach Step 5: `celebrate('success', ...)` + Toast "Tour abgeschlossen!" + `onComplete()`.

Alle Texte werden zweisprachig (de/en) in `translations.ts` gepflegt.

### Integration im ProgressPanel

**"Tour starten"-Button:**
- Im `progress-header`, neben dem Export-Button
- Nur sichtbar wenn `useFirstTouch('progress.tour_completed')` noch nicht `seen` ist
- Kleiner Button im bestehenden `btn-export-small`-Stil mit Text "Tour starten"

**State:**
- `const [tourActive, setTourActive] = useState(false)`
- `const [tourEvent, setTourEvent] = useState<string | null>(null)`

**Event-Dispatching in bestehenden Handlern:**
- `addItem()` → nach erfolgreichem Refetch: `setTourEvent('item-created')`
- `cycleStatus()` → wenn `next === 'in_progress'`: `setTourEvent('item-activated')`
- `addTodo()` → nach Erfolg: `setTourEvent('todo-created')`
- `toggleTodo()` → wenn gecheckt: `setTourEvent('todo-checked')`
- GuidedTour ruft `onEventConsumed` Callback auf nachdem ein Event verarbeitet wurde → `setTourEvent(null)`

**onComplete:**
- `tourComplete.markSeen()` — Button verschwindet permanent
- `celebrate('success', ...)` + Toast

**onSkip:**
- Tour wird geschlossen (`setTourActive(false)`)
- `markSeen` wird NICHT aufgerufen — Button bleibt sichtbar

### CSS / Styling

Alles in `src/renderer/src/index.css`:

**Spotlight-Overlay:**
- `position: fixed; inset: 0; z-index: 9000`
- Highlight-Element über dem Target positioniert
- `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)` für den Dimming-Effekt
- `border-radius: 8px`, `4px` Padding um das Target
- `transition: top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease` für smooth Step-Wechsel (kein `all` um Jank bei ResizeObserver-Callbacks zu vermeiden)

**Tooltip-Bubble:**
- `position: absolute`, relativ zum Target
- `background: var(--bg-card, #1e1e2e)`
- `border: 1px solid rgba(255,255,255,0.15)`
- `border-radius: 10px`
- `padding: 16px 20px`, `max-width: 300px`
- Titel: `font-weight: 600`, `font-size: 14px`
- Text: `font-size: 13px`, `opacity: 0.8`, `margin-top: 6px`
- Step-Indikator: `font-size: 11px`, `opacity: 0.5`, rechts unten ("2/5")
- "Überspringen"-Link: `font-size: 12px`, `opacity: 0.6`, links unten
- CSS-Dreieck (Pfeil) das zum Target zeigt

**Light-Mode:**
- `[data-theme="light"] .guided-tour-tooltip` mit `var(--bg)`, `var(--border)`, `var(--text)`

### Persistenz

Kein neuer API-Endpoint. Nutzt bestehendes `useFirstTouch('progress.tour_completed')` Pattern — Settings-Marker `ux_hint_seen_progress.tour_completed` in der `settings`-Tabelle.

### i18n

Neue Keys in `translations.ts`:
- `tour.progress.step1_title`, `tour.progress.step1_text`
- `tour.progress.step2_title`, `tour.progress.step2_text`
- `tour.progress.step3_title`, `tour.progress.step3_text`
- `tour.progress.step4_title`, `tour.progress.step4_text`
- `tour.progress.step5_title`, `tour.progress.step5_text`
- `tour.start`, `tour.skip`, `tour.acknowledged_button`, `tour.complete_toast`

## Geänderte Dateien

- **Neu:** `src/renderer/src/components/ux/GuidedTour.tsx`
- **Modify:** `src/renderer/src/panels/ProgressPanel.tsx`
- **Modify:** `src/renderer/src/index.css`
- **Modify:** `src/renderer/src/i18n/translations.ts`

## Out of Scope

- Tours für andere Panels (Pattern ist vorbereitet, kommt in eigenen Specs)
- Keyboard-Navigation innerhalb der Tour
- Animierte Übergänge zwischen Steps (nur smooth CSS-Transition auf Position)
- Automatisches Zurücksetzen der Tour
- Tour-Progress speichern (bei Abbruch startet die Tour beim nächsten Mal von vorne)

## Konventionen

- Direkter Commit auf `main`, conventional commits
- Typecheck + lint + manuelles QA (keine automatisierten Tests)
- Bestehende UX-Patterns nutzen (`useFirstTouch`, `celebrate`, Toast)
