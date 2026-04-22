# Stream-Profil: Panel-Auswahl nach Streaming-Typ

**Datum:** 2026-04-22

## Problem

Alle Panels sind standardmäßig sichtbar — das ist für neue User unübersichtlich. Je nach Streaming-Typ (kreativ, gaming, coding, chatting) braucht man nur einen Teil der Features.

## Lösung

Profil-Auswahl im Onboarding-Wizard + in den Settings. Profil setzt ein Preset für versteckte Panels über das bestehende `useDashboardLayout`-System. User kann danach jederzeit manuell ein-/ausblenden.

## Profile

5 Profile mit vordefinierten Panel-Presets:

| Profil | Key | Stream-Tab | Projekt-Tab |
|---|---|---|---|
| 🎨 Kreativ | `creative` | Challenge, Clips, Song | Progress, Milestones |
| 🎮 Gaming | `gaming` | Challenge, Clips, Issues, Song | — (hidden) |
| 💻 Coding | `coding` | Challenge, Clips, Issues | Progress, Milestones |
| 🎙️ Just Chatting | `chatting` | Challenge, Clips, Designs, Song | — (hidden) |
| ⚙️ Alles | `all` | Alle | Alle |

Panels die nicht in der Tabelle stehen werden `hidden`. Stats, Settings, Help bleiben immer sichtbar (keine Profil-Logik).

## Persistenz

- Settings-Key `stream_profile` in der `settings`-Tabelle (Werte: `creative`, `gaming`, `coding`, `chatting`, `all`)
- Kein neuer API-Endpoint — nutzt bestehendes `GET /settings/get/:key` und `POST /settings/set`
- Beim Profilwechsel: `hidden`-Arrays in `localStorage` (`dashboard-layout`) werden auf das Profil-Preset zurückgesetzt
- Default bei fehlendem Key: `all`

## Onboarding-Integration

Neuer Wizard-Step **"Profil"** als Step 2 (nach Language, vor Welcome):

- Überschrift: "Was streamst du?" / "What do you stream?"
- 5 Karten im Grid, jede mit: Emoji, Name, kurze Beschreibung (1 Zeile)
- Klick wählt aus (Border-Highlight)
- Default-Auswahl: `all`
- Beim Weiterklicken wird `stream_profile` in DB geschrieben

Beschreibungen:
- 🎨 Kreativ: "Art, Design, Musik — Fokus auf Projekte & Fortschritt"
- 🎮 Gaming: "Gameplay, Clips & Chat-Interaktion"
- 💻 Coding: "Programmieren, Tasks & Issues tracken"
- 🎙️ Just Chatting: "Unterhaltung, Abstimmungen & Musik"
- ⚙️ Alles: "Alle Features sichtbar"

## Settings-Integration

In der **App-Gruppe** (🖥️) ein neuer Abschnitt "Streaming-Profil":

- 5 Buttons im bestehenden `language-toggle`-Stil (gleiche Optionen wie Wizard)
- Aktives Profil ist highlighted
- Klick → sofortiger Wechsel: `stream_profile` in DB + `hidden`-Arrays reset
- Hinweistext darunter: "Ändert welche Panels sichtbar sind. Du kannst einzelne Panels jederzeit manuell ein-/ausblenden."

## Profil-Preset-Logik

Funktion `applyProfilePreset(profile: string)` in `useDashboardLayout.ts` (oder als separate Utility):

```ts
const ALL_STREAM_PANELS = ['challenge', 'issues', 'clips', 'designs', 'song'];
const ALL_PROJECT_PANELS = ['progress', 'milestones'];

const PROFILE_VISIBLE: Record<string, { stream: string[]; projekt: string[] }> = {
  creative: { stream: ['challenge', 'clips', 'song'], projekt: ['progress', 'milestones'] },
  gaming:   { stream: ['challenge', 'clips', 'issues', 'song'], projekt: [] },
  coding:   { stream: ['challenge', 'clips', 'issues'], projekt: ['progress', 'milestones'] },
  chatting: { stream: ['challenge', 'clips', 'designs', 'song'], projekt: [] },
  all:      { stream: ALL_STREAM_PANELS, projekt: ALL_PROJECT_PANELS },
};
```

Für jeden Tab: `hidden = ALL_PANELS - PROFILE_VISIBLE[profile]`. Die `order` und `fullWidth` Arrays bleiben unverändert.

**State-Synchronisation:** `applyProfilePreset` schreibt direkt in `localStorage` (da `useDashboardLayout` per-Tab instanziiert ist und keinen cross-Tab-Write bietet). Danach `window.location.reload()` um die Hook-States neu zu initialisieren. Einfachste Lösung, kein neuer State-Layer nötig — Profilwechsel passiert selten.

## Geänderte Dateien

- **Neu:** `src/renderer/src/components/onboarding/ProfileStep.tsx`
- **Modify:** `src/renderer/src/components/OnboardingWizard.tsx` — ProfileStep als Step 2 einfügen, SKIPPABLE-Indices von `{4, 6}` auf `{5, 7}` aktualisieren
- **Modify:** `src/renderer/src/panels/SettingsPanel.tsx` — Profil-Auswahl in App-Gruppe
- **Modify:** `src/renderer/src/hooks/useDashboardLayout.ts` — `applyProfilePreset()` Funktion exportieren
- **Modify:** `src/renderer/src/i18n/translations.ts` — Profil-Texte de/en
- **Modify:** `src/renderer/src/index.css` — Profil-Karten-Styles für Wizard

## Out of Scope

- Profil beeinflusst Overlays (alle bleiben verfügbar)
- Profil beeinflusst Chat-Commands (alle bleiben aktiv)
- Eigene/benutzerdefinierte Profile erstellen
- Profil-Import/Export

## Konventionen

- Direkter Commit auf `main`, conventional commits
- Typecheck + lint + manuelles QA
