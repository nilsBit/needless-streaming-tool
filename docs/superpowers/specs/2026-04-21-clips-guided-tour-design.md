# Clip Moments Guided Tour (Duolingo-Style)

**Datum:** 2026-04-21
**Vorgänger-Spec:** `docs/superpowers/specs/2026-04-21-progress-guided-tour-design.md`

## Problem

Der Clip Moments Panel hat keine geführte Einführung. Neue User sehen ein leeres Panel und müssen selbst herausfinden wie Tags, Clips und Filter funktionieren.

## Lösung

Gleiche Pattern wie Progress-Tour: "Tour starten"-Button im Header, Spotlight-Overlay mit Tooltip-Bubble, echte User-Aktionen. Nutzt die bestehende generische `<GuidedTour>`-Komponente.

## Tour-Steps

| # | targetSelector | title (de) | text (de) | waitFor | tooltipPosition |
|---|---|---|---|---|---|
| 1 | `.clips-panel-header` | "Dein Clip-Board" | "Hier sammelst du besondere Momente aus deinem Stream — Highlights, Fails, lustige Szenen und mehr." | `tour-acknowledged` | bottom |
| 2 | `.clip-custom select` | "Wähle einen Tag" | "Tags kategorisieren deine Clips. Wähle einen aus der Liste." | `tag-selected` | bottom |
| 3 | `.clip-custom input` | "Erstelle deinen ersten Clip" | "Gib eine kurze Notiz ein und drücke Enter." | `clip-created` | bottom |
| 4 | `.clip-tags .tag-btn` | "Filtere nach Tags" | "Klicke auf einen Tag um nur Clips dieser Kategorie zu sehen." | `tag-filtered` | bottom |
| 5 | `.clip-tags .tag-add` | "Erstelle einen eigenen Tag" | "Klicke auf + um einen eigenen Tag hinzuzufügen." | `tag-add-clicked` | left |
| 6 | `.clip-tags .tag-add-input input` | "Gib den Tag-Namen ein" | "Tippe einen Namen und drücke Enter." | `custom-tag-created` | bottom |

Step 1 ist passiv ("Verstanden"-Button). Steps 2-6 erfordern echte Aktionen.

Nach Step 6: `celebrate('success', null)` + Toast "Tour abgeschlossen!"

## Integration im ClipsPanel

**"Tour starten"-Button:**
- Im Header-Bereich, analog zu Progress-Panel
- Sichtbar bis `useFirstTouch('clips.tour_completed')` markiert

**State:**
- `const [tourActive, setTourActive] = useState(false)`
- `const [tourEvent, setTourEvent] = useState<string | null>(null)`

**Event-Dispatching:**
- Tag-Dropdown `onChange` → `setTourEvent('tag-selected')`
- `addClip()` Erfolg → `setTourEvent('clip-created')`
- Tag-Filter-Button Klick → `setTourEvent('tag-filtered')`
- Tag-Add-Button Klick (der + Button) → `setTourEvent('tag-add-clicked')`
- Custom-Tag erstellt → `setTourEvent('custom-tag-created')`

**onComplete:** `markSeen()` + `celebrate` + Toast
**onSkip:** Tour schließen, Button bleibt

## Geänderte Dateien

- **Modify:** `src/renderer/src/panels/ClipsPanel.tsx`
- **Modify:** `src/renderer/src/i18n/translations.ts`

Keine neue Komponente, kein CSS-Change, kein Backend-Change.

## Konventionen

- Direkter Commit auf `main`, conventional commits
- Typecheck + lint + manuelles QA
