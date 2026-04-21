# Progress-Panel Guided Tour — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Duolingo-style interaktives Tutorial für den Progress-Tracker — Spotlight-Overlay mit Tooltip-Bubble, 5 Steps mit echten User-Aktionen.

**Architecture:** Neue generische `<GuidedTour>` Komponente (React Portal + CSS box-shadow Spotlight). ProgressPanel steuert die Tour über Props (`currentEvent`, `onEventConsumed`). Persistenz via bestehendem `useFirstTouch` Pattern. Kein Backend-Change.

**Tech Stack:** React + TypeScript, createPortal, ResizeObserver, bestehende UX-Patterns (`useFirstTouch`, `celebrate`, Toast)

**Spec:** `docs/superpowers/specs/2026-04-21-progress-guided-tour-design.md`

**Convention note:** Dieses Projekt nutzt **keine automatisierten Tests**. Verifikation per `npm run typecheck`, `npm run lint`, und manuellem QA. Frequent commits per Task.

---

### Task 1: i18n-Keys für die Tour

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Tour-Keys einfügen**

Suche im File die letzte Zeile vor `} as const;` (aktuell Zeile 488). Füge direkt **vor** `} as const;` ein:

```ts
  // ---- Guided Tour ----
  'tour.start': { de: 'Tour starten', en: 'Start tour' },
  'tour.skip': { de: 'Überspringen', en: 'Skip' },
  'tour.acknowledged_button': { de: 'Verstanden', en: 'Got it' },
  'tour.complete_toast': { de: 'Tour abgeschlossen! Du kennst jetzt die Basics.', en: 'Tour complete! You know the basics now.' },
  'tour.progress.step1_title': { de: 'Dein Kanban-Board', en: 'Your Kanban Board' },
  'tour.progress.step1_text': { de: 'Hier verwaltest du deine Features und Tasks. Drei Spalten: Backlog, Aktiv, Erledigt.', en: 'Manage your features and tasks here. Three columns: Backlog, Active, Done.' },
  'tour.progress.step2_title': { de: 'Erstelle dein erstes Item', en: 'Create your first item' },
  'tour.progress.step2_text': { de: 'Gib einen Namen ein und drücke Enter.', en: 'Type a name and press Enter.' },
  'tour.progress.step3_title': { de: 'Aktiviere es', en: 'Activate it' },
  'tour.progress.step3_text': { de: 'Klicke auf das Symbol um das Item zu starten. Der Timer läuft dann mit.', en: 'Click the icon to start the item. The timer will start automatically.' },
  'tour.progress.step4_title': { de: 'Füge eine Sub-Task hinzu', en: 'Add a sub-task' },
  'tour.progress.step4_text': { de: 'Sub-Tasks erscheinen live im Overlay. Gib eine ein und drücke Enter.', en: 'Sub-tasks appear live in the overlay. Type one and press Enter.' },
  'tour.progress.step5_title': { de: 'Hake sie ab', en: 'Check it off' },
  'tour.progress.step5_text': { de: 'Geschafft! So trackst du deinen Fortschritt live on-stream.', en: 'Done! This is how you track progress live on-stream.' },

```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "feat(i18n): add guided tour translation keys"
```

---

### Task 2: GuidedTour-Komponente erstellen

**Files:**
- Create: `src/renderer/src/components/ux/GuidedTour.tsx`

- [ ] **Step 1: Komponente schreiben**

Erstelle `src/renderer/src/components/ux/GuidedTour.tsx` mit folgendem Inhalt:

```tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../i18n/LanguageContext';

export interface TourStep {
  targetSelector: string;
  title: string;
  text: string;
  waitFor: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
}

interface Props {
  steps: TourStep[];
  currentEvent: string | null;
  onEventConsumed: () => void;
  onComplete: () => void;
  onSkip: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 4;
const POLL_TIMEOUT = 2000;

export default function GuidedTour({ steps, currentEvent, onEventConsumed, onComplete, onSkip }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const pollRef = useRef<number>(0);
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onEventConsumedRef = useRef(onEventConsumed);
  onEventConsumedRef.current = onEventConsumed;
  const { t } = useTranslation();

  const step = steps[stepIndex];

  // Find and track target element position
  const updateRect = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.targetSelector);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({
      top: r.top - PADDING,
      left: r.left - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    });
  }, [step]);

  // Poll for target element if not in DOM yet
  useEffect(() => {
    updateRect();
    const el = document.querySelector(step?.targetSelector || '');
    if (el) return; // already found

    const start = Date.now();
    let rafId = 0;
    const poll = () => {
      if (Date.now() - start > POLL_TIMEOUT) {
        onSkipRef.current(); // target never appeared — abort tour
        return;
      }
      const found = document.querySelector(step?.targetSelector || '');
      if (found) {
        updateRect();
      } else {
        rafId = requestAnimationFrame(poll);
      }
    };
    rafId = requestAnimationFrame(poll);
    pollRef.current = rafId;
    return () => cancelAnimationFrame(rafId);
  }, [step, updateRect]);

  // Reposition on resize/scroll
  useEffect(() => {
    const observer = new ResizeObserver(updateRect);
    observer.observe(document.body);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [updateRect]);

  // Escape key to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSkip]);

  // Advance on matching event
  const advance = useCallback(() => {
    onEventConsumedRef.current();
    if (stepIndex >= steps.length - 1) {
      onCompleteRef.current();
    } else {
      setStepIndex(i => i + 1);
    }
  }, [stepIndex, steps.length]);

  useEffect(() => {
    if (!currentEvent || !step) return;
    if (currentEvent !== step.waitFor) return;
    advance();
  }, [currentEvent, step, advance]);

  if (!step || !targetRect) return null;

  const pos = step.tooltipPosition || 'bottom';
  const tooltipStyle = computeTooltipStyle(targetRect, pos);

  return createPortal(
    <div className="guided-tour-overlay" onClick={e => e.stopPropagation()}>
      <div
        className="guided-tour-highlight"
        style={{
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: targetRect.height,
        }}
      />
      <div className={`guided-tour-tooltip guided-tour-tooltip--${pos}`} style={tooltipStyle}>
        <div className="guided-tour-tooltip-title">{step.title}</div>
        <div className="guided-tour-tooltip-text">{step.text}</div>
        {step.waitFor === 'tour-acknowledged' && (
          <button className="guided-tour-tooltip-ack" onClick={advance}>
            {t('tour.acknowledged_button')}
          </button>
        )}
        <div className="guided-tour-tooltip-footer">
          <span className="guided-tour-tooltip-skip" onClick={onSkip}>
            {t('tour.skip')}
          </span>
          <span className="guided-tour-tooltip-step">
            {stepIndex + 1}/{steps.length}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function computeTooltipStyle(rect: Rect, pos: string): React.CSSProperties {
  const gap = 12;
  switch (pos) {
    case 'top':
      return { bottom: window.innerHeight - rect.top + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
    case 'left':
      return { top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + gap, transform: 'translateY(-50%)' };
    case 'right':
      return { top: rect.top + rect.height / 2, left: rect.left + rect.width + gap, transform: 'translateY(-50%)' };
    case 'bottom':
    default:
      return { top: rect.top + rect.height + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ux/GuidedTour.tsx
git commit -m "feat(ux): add generic GuidedTour component with spotlight overlay"
```

---

### Task 3: CSS für GuidedTour

**Files:**
- Modify: `src/renderer/src/index.css` (am Ende der Datei, nach Zeile 2937)

- [ ] **Step 1: Styles einfügen**

Am Ende von `src/renderer/src/index.css` (nach der letzten Zeile) einfügen:

```css
/* ---------- Guided Tour ---------- */
.guided-tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  pointer-events: none;
}
.guided-tour-highlight {
  position: fixed;
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,0.6);
  z-index: 9000;
  pointer-events: none;
  transition: top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease;
}
.guided-tour-tooltip {
  position: fixed;
  z-index: 9001;
  background: var(--bg-card, #1e1e2e);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 16px 20px;
  max-width: 300px;
  min-width: 220px;
  pointer-events: auto;
  filter: drop-shadow(0 4px 20px rgba(0,0,0,0.4));
}
.guided-tour-tooltip::after {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--bg-card, #1e1e2e);
  border: 1px solid rgba(255,255,255,0.15);
  transform: rotate(45deg);
}
/* Arrow positions */
.guided-tour-tooltip--bottom::after {
  top: -6px;
  left: 50%;
  margin-left: -5px;
  border-right: none;
  border-bottom: none;
}
.guided-tour-tooltip--top::after {
  bottom: -6px;
  left: 50%;
  margin-left: -5px;
  border-left: none;
  border-top: none;
}
.guided-tour-tooltip--left::after {
  right: -6px;
  top: 50%;
  margin-top: -5px;
  border-left: none;
  border-top: none;
}
.guided-tour-tooltip--right::after {
  left: -6px;
  top: 50%;
  margin-top: -5px;
  border-right: none;
  border-bottom: none;
}
.guided-tour-tooltip-title {
  font-weight: 600;
  font-size: 14px;
}
.guided-tour-tooltip-text {
  font-size: 13px;
  opacity: 0.8;
  margin-top: 6px;
  line-height: 1.45;
}
.guided-tour-tooltip-ack {
  margin-top: 12px;
  padding: 7px 16px;
  border-radius: 8px;
  background: var(--accent, #4a9eff);
  color: white;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  width: 100%;
}
.guided-tour-tooltip-ack:hover { filter: brightness(1.1); }
.guided-tour-tooltip-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}
.guided-tour-tooltip-skip {
  font-size: 12px;
  opacity: 0.6;
  cursor: pointer;
}
.guided-tour-tooltip-skip:hover { opacity: 1; }
.guided-tour-tooltip-step {
  font-size: 11px;
  opacity: 0.5;
}

/* Light mode */
[data-theme="light"] .guided-tour-tooltip {
  background: var(--bg, #fff);
  border-color: var(--border, #ddd);
  color: var(--text, #333);
}
[data-theme="light"] .guided-tour-tooltip::after {
  background: var(--bg, #fff);
  border-color: var(--border, #ddd);
}

@media (prefers-reduced-motion: reduce) {
  .guided-tour-highlight { transition: none; }
}
```

- [ ] **Step 2: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(ux): add guided tour spotlight and tooltip styles"
```

---

### Task 4: Tour in ProgressPanel integrieren

**Files:**
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`

- [ ] **Step 1: Imports erweitern**

Suche in `ProgressPanel.tsx`:

```tsx
import { celebrate } from '../components/ux/celebrate';
import { useFirstTouch } from '../components/ux/useFirstTouch';
```

Ersetze durch:

```tsx
import { celebrate } from '../components/ux/celebrate';
import { useFirstTouch } from '../components/ux/useFirstTouch';
import GuidedTour, { TourStep } from '../components/ux/GuidedTour';
```

- [ ] **Step 2: Tour-State und useFirstTouch hinzufügen**

Suche in `ProgressPanel.tsx`:

```tsx
  const firstActivate = useFirstTouch('progress.activate_item');
  const firstCheck = useFirstTouch('progress.first_todo_checked');
```

Ersetze durch:

```tsx
  const firstActivate = useFirstTouch('progress.activate_item');
  const firstCheck = useFirstTouch('progress.first_todo_checked');
  const tourComplete = useFirstTouch('progress.tour_completed');
  const [tourActive, setTourActive] = useState(false);
  const [tourEvent, setTourEvent] = useState<string | null>(null);
```

- [ ] **Step 3: Tour-Steps-Array hinzufügen**

Suche in `ProgressPanel.tsx`:

```tsx
  useWebSocket((event) => {
    if (event.startsWith('progress-')) refetch();
  });
```

Füge **direkt davor** ein:

```tsx
  const tourSteps: TourStep[] = [
    { targetSelector: '.kanban-board', title: t('tour.progress.step1_title'), text: t('tour.progress.step1_text'), waitFor: 'tour-acknowledged', tooltipPosition: 'bottom' },
    { targetSelector: '.kanban-column:first-child .kanban-add input', title: t('tour.progress.step2_title'), text: t('tour.progress.step2_text'), waitFor: 'item-created', tooltipPosition: 'top' },
    { targetSelector: '.kanban-column:first-child .kanban-item:last-child .status-toggle', title: t('tour.progress.step3_title'), text: t('tour.progress.step3_text'), waitFor: 'item-activated', tooltipPosition: 'right' },
    { targetSelector: '.kanban-item.expanded .sub-todo-add input', title: t('tour.progress.step4_title'), text: t('tour.progress.step4_text'), waitFor: 'todo-created', tooltipPosition: 'top' },
    { targetSelector: '.kanban-item.expanded .sub-todo-check', title: t('tour.progress.step5_title'), text: t('tour.progress.step5_text'), waitFor: 'todo-checked', tooltipPosition: 'right' },
  ];

```

- [ ] **Step 4: Tour-Events in bestehende Handler einfügen**

**In `addItem()`** — suche:

```tsx
    setNewItem('');
    refetch();
  };
```

Ersetze durch:

```tsx
    setNewItem('');
    refetch();
    if (tourActive) setTourEvent('item-created');
  };
```

**In `cycleStatus()`** — suche:

```tsx
    if (next === 'in_progress' && (item.todos || []).length === 0) {
```

Füge **direkt davor** ein:

```tsx
    if (tourActive && next === 'in_progress') setTourEvent('item-activated');
```

**In `addTodo()`** — suche:

```tsx
    setNewTodoText(prev => ({ ...prev, [itemId]: '' }));
    refetch();
  };
```

Ersetze durch:

```tsx
    setNewTodoText(prev => ({ ...prev, [itemId]: '' }));
    refetch();
    if (tourActive) setTourEvent('todo-created');
  };
```

**In `toggleTodo()`** — suche:

```tsx
    if (currentDone === 0 && !firstCheck.seen && !firstCheck.loading) {
```

Füge **direkt davor** ein:

```tsx
    if (tourActive && currentDone === 0) setTourEvent('todo-checked');
```

- [ ] **Step 5: Tour-Button im Header einfügen**

Suche:

```tsx
        <button className="btn-export-small" onClick={exportCsv} title={t('progress.export_csv')}>📥</button>
```

Ersetze durch:

```tsx
        <button className="btn-export-small" onClick={exportCsv} title={t('progress.export_csv')}>📥</button>
        {!tourComplete.seen && !tourComplete.loading && (
          <button className="btn-export-small" onClick={() => setTourActive(true)} title={t('tour.start')}>🎯 {t('tour.start')}</button>
        )}
```

- [ ] **Step 6: GuidedTour-Komponente rendern**

Suche:

```tsx
      <ChatCommands commands={[
```

Füge **direkt davor** ein:

```tsx
      {tourActive && (
        <GuidedTour
          steps={tourSteps}
          currentEvent={tourEvent}
          onEventConsumed={() => setTourEvent(null)}
          onComplete={() => {
            setTourActive(false);
            tourComplete.markSeen();
            celebrate('success', null);
            toast.success(t('tour.complete_toast'));
          }}
          onSkip={() => {
            setTourActive(false);
            setTourEvent(null);
          }}
        />
      )}

```

- [ ] **Step 7: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`
Expected: keine Fehler.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/panels/ProgressPanel.tsx
git commit -m "feat(progress): integrate guided tour with spotlight overlay"
```

---

### Task 5: Manuelles QA

**Files:** keine

- [ ] **Step 1: Dev-Server starten**

Run: `npm run dev`

- [ ] **Step 2: QA-Pfad — Tour-Button sichtbar**

1. Progress-Panel öffnen
2. **Erwartung:** "🎯 Tour starten"-Button sichtbar im Header neben Export-Button
3. Andere Panels haben keinen Tour-Button

- [ ] **Step 3: QA-Pfad — Tour komplett durchspielen**

1. "Tour starten" klicken
2. **Step 1:** Spotlight über gesamtem Kanban-Board, Tooltip "Dein Kanban-Board" mit "Verstanden"-Button → Klicken
3. **Step 2:** Spotlight auf Input-Feld in Backlog-Spalte, Tooltip "Erstelle dein erstes Item" → Text eingeben + Enter
4. **Step 3:** Spotlight auf Status-Toggle des neuen Items, Tooltip "Aktiviere es" → Klicken
5. **Step 4:** Spotlight auf Sub-Todo-Input (Item ist auto-expandiert), Tooltip "Füge eine Sub-Task hinzu" → Text + Enter
6. **Step 5:** Spotlight auf Checkbox der Sub-Task, Tooltip "Hake sie ab" → Klicken
7. **Erwartung:** Celebrate-Animation + Toast "Tour abgeschlossen!"
8. **Erwartung:** Tour-Button verschwindet aus dem Header

- [ ] **Step 4: QA-Pfad — Tour abbrechen und neustarten**

1. DB zurücksetzen oder Settings-Marker löschen (alternativ neuen User simulieren)
2. Tour starten → bei Step 2 "Überspringen" klicken
3. **Erwartung:** Tour schließt, Button bleibt sichtbar
4. Tour erneut starten → startet wieder bei Step 1

- [ ] **Step 5: QA-Pfad — Escape-Taste**

1. Tour starten → Escape drücken
2. **Erwartung:** Tour schließt, Button bleibt sichtbar

- [ ] **Step 6: QA-Pfad — Light Mode**

1. Settings → Theme → Light
2. Tour starten
3. **Erwartung:** Tooltip lesbar, Border sichtbar, Pfeil korrekt gefärbt

- [ ] **Step 7: QA-Pfad — Step-Indikator**

Während der Tour: Tooltip zeigt "1/5", "2/5", etc. in der rechten unteren Ecke.

---

## Notes for Implementation

- **Convention:** Direkter Commit auf `main`, conventional commits (`feat:`, `style:`)
- **No automated tests** — verifiziert per typecheck + lint + manuellem QA
- **Pointer-Events:** Das Overlay (`pointer-events: none`) lässt Klicks durch zum darunterliegenden Target. Nur der Tooltip selbst (`pointer-events: auto`) fängt Klicks ab.
- **Toast z-index (9999) > Tooltip z-index (9001):** Toasts bleiben immer sichtbar über der Tour.
- **`currentEvent` Prop-Pattern:** Einfacher als `useImperativeHandle` und konsistent mit dem restlichen Codebase-Stil. `onEventConsumed` setzt den Event zurück damit der gleiche Event nicht doppelt matcht.
- **Step 1 Sonderbehandlung:** Der "Verstanden"-Button im Tooltip dispatcht das `tour-acknowledged` Event direkt in der Komponente — kein Panel-Handler nötig.
