# i18n Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all ~120 hardcoded German strings with the `t()` i18n system, add English translations, restructure help docs, and add language selection to onboarding.

**Architecture:** Extend existing `t()` + `LanguageContext` system. Add ~120 new keys to `translations.ts`. Each panel/component gets `useTranslation()` hook and replaces hardcoded strings with `t('key')` calls. Help docs split into per-language files. LanguageStep added as Step 0 in onboarding wizard.

**Tech Stack:** React, TypeScript, existing i18n system (`translations.ts`, `LanguageContext.tsx`)

**Spec:** `docs/superpowers/specs/2026-04-17-i18n-completion-design.md`

**Pattern for all components:** Import `useTranslation`, destructure `{ t }`, replace German strings with `t('key')`. For dynamic strings: `` `${t('key')} (${count})` ``

---

### Task 1: Add all new translation keys to translations.ts

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Fix existing issue and add all new keys**

Add the following keys to `translations.ts`. Group them logically. Also fix `panel.issues` EN value from `'Glücksrad'` to `'Lucky Wheel'`.

```ts
// Fix existing
'panel.issues': { de: 'Glücksrad', en: 'Lucky Wheel' },

// ---- Challenge Panel ----
'challenge.desc': { de: 'Setz dein Ziel für den Stream. Timer startet automatisch.', en: 'Set your goal for the stream. Timer starts automatically.' },
'challenge.placeholder': { de: 'Was willst du heute schaffen?', en: 'What do you want to accomplish today?' },
'challenge.start': { de: 'Los!', en: 'Go!' },
'challenge.running': { de: 'Läuft', en: 'Running' },
'challenge.done': { de: 'Geschafft!', en: 'Done!' },
'challenge.failed': { de: 'Gescheitert', en: 'Failed' },
'challenge.btn_done': { de: '✅ Geschafft', en: '✅ Done' },
'challenge.btn_failed': { de: '❌ Nicht geschafft', en: '❌ Failed' },
'challenge.btn_cancel': { de: 'Abbrechen', en: 'Cancel' },
'challenge.pause': { de: 'Pausieren', en: 'Pause' },
'challenge.resume': { de: 'Weiter', en: 'Resume' },
'challenge.cmd_challenge': { de: 'Zeigt aktuelle Challenge + Status', en: 'Shows current challenge + status' },
'challenge.cmd_uptime': { de: 'Wie lange läuft der Stream', en: 'How long the stream has been running' },

// ---- Issues Panel ----
'issues.desc': { de: 'Issues sammeln, Rad drehen, Chat entscheidet was dran kommt.', en: 'Collect issues, spin the wheel, chat decides what\'s next.' },
'issues.placeholder': { de: 'Neues Issue...', en: 'New issue...' },
'issues.spinning': { de: '🎰 Spinning...', en: '🎰 Spinning...' },
'issues.cooldown': { de: 'Cooldown', en: 'Cooldown' },
'issues.spin': { de: '🎰 Drehen!', en: '🎰 Spin!' },
'issues.open': { de: 'Offen', en: 'Open' },
'issues.fixed': { de: 'Gefixt', en: 'Fixed' },
'issues.cmd_issues': { de: 'Zeigt offene Issues', en: 'Shows open issues' },

// ---- Todos Panel ----
'todos.desc': { de: 'Deine Stream-Todos. Sichtbar als Overlay in OBS.', en: 'Your stream todos. Visible as overlay in OBS.' },
'todos.placeholder': { de: 'Neues Todo...', en: 'New todo...' },
'todos.empty': { de: 'Keine Todos', en: 'No todos' },
'todos.done_section': { de: 'Erledigt', en: 'Done' },

// ---- Rewards Panel ----
'rewards.desc': { de: 'Channel Point Rewards die eingelöst wurden. Abhaken wenn erledigt.', en: 'Channel point rewards that have been redeemed. Check off when done.' },
'rewards.empty': { de: 'Keine offenen Rewards', en: 'No pending rewards' },
'rewards.done_section': { de: 'Erledigt', en: 'Done' },
'rewards.clear_done': { de: '🗑️ Erledigte löschen', en: '🗑️ Clear done' },

// ---- Stats Panel ----
'stats.loading': { de: 'Wird geladen...', en: 'Loading...' },
'stats.desc': { de: 'Überblick über alle Stream-Daten.', en: 'Overview of all stream data.' },
'stats.total_clips': { de: 'Clips gesamt', en: 'Total clips' },
'stats.today_clips': { de: 'Clips heute', en: 'Clips today' },
'stats.total_issues': { de: 'Issues gesamt', en: 'Total issues' },
'stats.open_issues': { de: 'Offene Issues', en: 'Open issues' },
'stats.done_todos': { de: 'Erledigte Todos', en: 'Completed todos' },
'stats.total_todos': { de: 'Todos gesamt', en: 'Total todos' },
'stats.completed_milestones': { de: 'Erreichte Meilensteine', en: 'Completed milestones' },
'stats.total_milestones': { de: 'Meilensteine gesamt', en: 'Total milestones' },
'stats.total_raids': { de: 'Raids gesamt', en: 'Total raids' },
'stats.total_rewards': { de: 'Belohnungen gesamt', en: 'Total rewards' },

// ---- Clips Panel ----
'clips.note_placeholder': { de: 'Notiz (optional)...', en: 'Note (optional)...' },
'clips.add': { de: '+ Clip', en: '+ Clip' },
'clips.empty': { de: 'Keine Clips', en: 'No clips' },
'clips.today': { de: 'Heute', en: 'Today' },
'clips.no_clips_filter': { de: 'Keine Clips', en: 'No clips' },
'clips.with_tag': { de: 'mit Tag', en: 'with tag' },

// ---- Designs Panel ----
'designs.desc': { de: '1x im Monat designed der Chat ein Feature. Erstell ein Design und lass abstimmen.', en: 'Once a month the chat designs a feature. Create a design and let them vote.' },
'designs.placeholder': { de: 'Design-Titel...', en: 'Design title...' },
'designs.vote_running': { de: '🗳️ Abstimmung läuft', en: '🗳️ Vote running' },
'designs.vote_end': { de: '🏆 Beenden', en: '🏆 End' },
'designs.vote_cancel': { de: '✖ Abbrechen', en: '✖ Cancel' },
'designs.option_placeholder': { de: 'Option hinzufügen...', en: 'Add option...' },
'designs.vote_start': { de: '🗳️ Abstimmung starten', en: '🗳️ Start vote' },
'designs.no_active': { de: 'Kein aktives Design', en: 'No active design' },
'designs.completed': { de: 'Abgeschlossen', en: 'Completed' },
'designs.cmd_start': { de: 'Abstimmung starten', en: 'Start vote' },
'designs.cmd_end': { de: 'Abstimmung beenden', en: 'End vote' },
'designs.cmd_status': { de: 'Aktueller Stand', en: 'Current status' },
'designs.cmd_vote': { de: 'Für eine Option stimmen', en: 'Vote for an option' },

// ---- Song Panel ----
'song.desc': { de: 'Aktuellen Song für den Stream setzen.', en: 'Set the current song for the stream.' },
'song.placeholder': { de: 'Song eingeben...', en: 'Enter song...' },
'song.set': { de: 'Übernehmen', en: 'Set' },
'song.clear': { de: 'Löschen', en: 'Clear' },

// ---- Raids Panel ----
'raids.desc': { de: 'Übersicht aller eingegangenen Raids.', en: 'Overview of all incoming raids.' },
'raids.empty': { de: 'Noch keine Raids', en: 'No raids yet' },
'raids.viewers': { de: 'Zuschauer', en: 'viewers' },

// ---- Milestones Panel ----
'milestones.empty': { de: 'Keine offenen Milestones', en: 'No pending milestones' },
'milestones.completed': { de: 'Erledigt', en: 'Completed' },

// ---- Progress Panel ----
'progress.project_placeholder': { de: 'Projektname...', en: 'Project name...' },
'progress.no_project': { de: 'Kein Projekt', en: 'No project' },
'progress.item_placeholder': { de: 'Neues Item...', en: 'New item...' },
'progress.cmd_progress': { de: 'Zeigt Projektfortschritt', en: 'Shows project progress' },

// ---- Chat Panel ----
'chat.connect_first': { de: 'Verbinde zuerst Twitch in den Settings.', en: 'Connect Twitch in Settings first.' },

// ---- Hotkeys Panel ----
'hotkeys.desc': { de: 'Globale Tastenkürzel konfigurieren.', en: 'Configure global keyboard shortcuts.' },
'hotkeys.section_title': { de: 'Tastenkürzel', en: 'Keyboard Shortcuts' },
'hotkeys.format_hint': { de: 'Format: <code>CommandOrControl+Shift+Taste</code> — Verwende <code>CommandOrControl</code> für plattformübergreifende Kompatibilität.', en: 'Format: <code>CommandOrControl+Shift+Key</code> — Use <code>CommandOrControl</code> for cross-platform compatibility.' },
'hotkeys.edit': { de: 'Ändern', en: 'Edit' },
'hotkeys.save': { de: '💾 Speichern', en: '💾 Save' },
'hotkeys.saved': { de: 'Gespeichert!', en: 'Saved!' },
'hotkeys.restart_hint': { de: 'Hinweis: Änderungen werden erst nach einem Neustart der App wirksam.', en: 'Note: Changes take effect after restarting the app.' },
'hotkeys.loading': { de: 'Laden...', en: 'Loading...' },
'hotkeys.challenge_toggle': { de: 'Challenge umschalten', en: 'Toggle challenge' },
'hotkeys.timer_toggle': { de: 'Timer umschalten', en: 'Toggle timer' },
'hotkeys.hype_moment': { de: 'Hype Moment', en: 'Hype Moment' },
'hotkeys.challenge_done': { de: 'Challenge geschafft', en: 'Challenge done' },
'hotkeys.challenge_failed': { de: 'Challenge fehlgeschlagen', en: 'Challenge failed' },
'hotkeys.roulette': { de: 'Glücksrad', en: 'Lucky Wheel' },
'hotkeys.milestone_minor': { de: 'Milestone (Minor)', en: 'Milestone (Minor)' },
'hotkeys.milestone_major': { de: 'Milestone (Major)', en: 'Milestone (Major)' },
'hotkeys.milestone_epic': { de: 'Milestone (Epic)', en: 'Milestone (Epic)' },

// ---- Settings Panel (additional keys) ----
'settings.twitch_step1': { de: 'Schritt 1: Erstelle eine App auf dev.twitch.tv und trage die Client-ID ein.', en: 'Step 1: Create an app on dev.twitch.tv and enter the Client ID.' },
'settings.twitch_placeholder': { de: 'Twitch Client-ID...', en: 'Twitch Client ID...' },
'settings.client_id_label': { de: 'Client-ID', en: 'Client ID' },
'settings.obs_host': { de: 'Host (localhost)', en: 'Host (localhost)' },
'settings.obs_port': { de: 'Port (4455)', en: 'Port (4455)' },
'settings.obs_password': { de: 'Passwort (optional)', en: 'Password (optional)' },
'settings.obs_with_password': { de: '(mit Passwort)', en: '(with password)' },
'settings.obs_without_password': { de: '(ohne Passwort)', en: '(without password)' },
'settings.autostart': { de: 'Autostart', en: 'Autostart' },
'settings.autostart_desc': { de: 'App beim Systemstart automatisch öffnen.', en: 'Open app automatically on system startup.' },
'settings.enabled': { de: 'Aktiviert', en: 'Enabled' },
'settings.disabled': { de: 'Deaktiviert', en: 'Disabled' },
'settings.backup': { de: 'Daten-Backup', en: 'Data Backup' },
'settings.backup_desc': { de: 'Alle Daten als JSON exportieren oder ein Backup importieren.', en: 'Export all data as JSON or import a backup.' },
'settings.backup_export': { de: '💾 Backup exportieren', en: '💾 Export backup' },
'settings.backup_import': { de: '📂 Backup importieren', en: '📂 Import backup' },
'settings.backup_exported': { de: 'Backup exportiert!', en: 'Backup exported!' },
'settings.backup_imported': { de: 'Backup erfolgreich importiert!', en: 'Backup imported successfully!' },
'settings.export_failed': { de: 'Export fehlgeschlagen', en: 'Export failed' },
'settings.import_failed': { de: 'Import fehlgeschlagen', en: 'Import failed' },
'settings.token_loading': { de: 'Token wird geladen...', en: 'Loading token...' },
'settings.design': { de: 'Design', en: 'Design' },
'settings.design_desc': { de: 'App-Theme wechseln.', en: 'Change app theme.' },
'settings.notion_placeholder': { de: 'Notion Internal Integration Token (ntn_...)', en: 'Notion Internal Integration Token (ntn_...)' },
'settings.notion_db_placeholder': { de: 'Notion Database ID oder URL...', en: 'Notion Database ID or URL...' },

// ---- Overlays Panel (additional keys) ----
'overlays_panel.preview': { de: 'Vorschau', en: 'Preview' },
'overlays_panel.close': { de: '✕ Schließen', en: '✕ Close' },
'overlays_panel.file': { de: '📄 Datei', en: '📄 File' },
'overlays_panel.replace': { de: 'Design ersetzen', en: 'Replace design' },
'overlays_panel.reset': { de: 'Auf Standard zurücksetzen', en: 'Reset to default' },
'overlays_panel.name_placeholder': { de: 'Overlay Name (z.B. mein-alerts)...', en: 'Overlay name (e.g. my-alerts)...' },
'overlays_panel.creating': { de: 'Erstellen...', en: 'Creating...' },
'overlays_panel.guide_step1': { de: 'URL kopieren (📋)', en: 'Copy URL (📋)' },
'overlays_panel.guide_step2': { de: 'In OBS: Quellen → + → <strong>Browser</strong>', en: 'In OBS: Sources → + → <strong>Browser</strong>' },
'overlays_panel.guide_step3': { de: 'URL einfügen, Breite/Höhe anpassen', en: 'Paste URL, adjust width/height' },
'overlays_panel.guide_step4': { de: 'Zum Anpassen: ✏️ klicken und eigene HTML-Datei hochladen', en: 'To customize: click ✏️ and upload your own HTML file' },
'overlays_panel.guide_step5': { de: 'Zum Zurücksetzen: ↩️ klicken', en: 'To reset: click ↩️' },

// ---- Error Boundary ----
'error.title': { de: 'Fehler', en: 'Error' },
'error.message': { de: 'Etwas ist schiefgelaufen.', en: 'Something went wrong.' },
'error.retry': { de: 'Nochmal versuchen', en: 'Try again' },

// ---- Chat Commands ----
'chatcmds.label': { de: '💬 Chat Commands', en: '💬 Chat Commands' },

// ---- Language Step ----
'language.title': { de: 'Sprache / Language', en: 'Language / Sprache' },
'language.subtitle': { de: 'Wähle deine Sprache.', en: 'Choose your language.' },
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "feat(i18n): add ~120 new translation keys for all panels and components"
```

---

### Task 2: Create LanguageStep + Update OnboardingWizard

**Files:**
- Create: `src/renderer/src/components/onboarding/LanguageStep.tsx`
- Modify: `src/renderer/src/components/OnboardingWizard.tsx`

- [ ] **Step 1: Create LanguageStep**

```tsx
import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';

export default function LanguageStep({ onNext }: { onNext: () => void }) {
  const { setLang } = useTranslation();

  const select = (lang: 'de' | 'en') => {
    setLang(lang);
    onNext();
  };

  return (
    <div className="onboarding-step welcome-step">
      <div className="welcome-icon">🌐</div>
      <h1>Sprache / Language</h1>
      <p className="welcome-text">Wähle deine Sprache. / Choose your language.</p>
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '24px' }}>
        <button className="btn-primary" onClick={() => select('de')} style={{ fontSize: '18px', padding: '16px 32px' }}>
          🇩🇪 Deutsch
        </button>
        <button className="btn-primary" onClick={() => select('en')} style={{ fontSize: '18px', padding: '16px 32px' }}>
          🇬🇧 English
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update OnboardingWizard.tsx**

Add import for LanguageStep, update STEPS array and SKIPPABLE indices, wire up navigation with `t()`:

```tsx
import LanguageStep from './onboarding/LanguageStep';
import { useTranslation } from '../i18n/LanguageContext';
```

Update constants:
```ts
const STEPS = ['Language', 'Welcome', 'Twitch', 'OBS', 'Notion', 'Overlays', 'Stream Deck', 'Fertig'];
const SKIPPABLE = new Set([4, 6]); // Notion, Stream Deck (shifted +1)
```

Update step rendering (add LanguageStep at step 0, shift all others by 1):
```tsx
{step === 0 && <LanguageStep onNext={next} />}
{step === 1 && <WelcomeStep onNext={next} />}
{step === 2 && <TwitchStep />}
{step === 3 && <ObsStep />}
{step === 4 && <NotionStep />}
{step === 5 && <OverlaysStep />}
{step === 6 && <StreamDeckStep />}
{step === 7 && <DoneStep onFinish={finish} />}
```

Update navigation buttons to use `t()`:
```tsx
const { t } = useTranslation();
// ...
<button className="btn-back" onClick={back}>{t('onboarding.back')}</button>
// ...
<button className="btn-skip" onClick={next}>{t('onboarding.skip')}</button>
// ...
<button className="btn-primary" onClick={next}>{t('onboarding.next')}</button>
```

Hide step indicators on step 0 (LanguageStep):
```tsx
{step > 0 && (
  <div className="step-indicators">
```
This already works since step 0 is hidden.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/onboarding/LanguageStep.tsx src/renderer/src/components/OnboardingWizard.tsx
git commit -m "feat(i18n): add LanguageStep to onboarding wizard"
```

---

### Task 3: Wire up onboarding steps to use t()

**Files:**
- Modify: `src/renderer/src/components/onboarding/WelcomeStep.tsx`
- Modify: `src/renderer/src/components/onboarding/TwitchStep.tsx`
- Modify: `src/renderer/src/components/onboarding/ObsStep.tsx`
- Modify: `src/renderer/src/components/onboarding/NotionStep.tsx`
- Modify: `src/renderer/src/components/onboarding/OverlaysStep.tsx`
- Modify: `src/renderer/src/components/onboarding/StreamDeckStep.tsx`
- Modify: `src/renderer/src/components/onboarding/DoneStep.tsx`

- [ ] **Step 1: Update all onboarding steps**

Each file already has translation keys defined in `translations.ts`. Add `useTranslation` import and replace hardcoded strings:

**WelcomeStep.tsx** — Replace 4 strings:
- `'Willkommen im Lab!'` → `{t('onboarding.welcome_title')}`
- Welcome text → `{t('onboarding.welcome_text')}`
- Subtitle → `{t('onboarding.welcome_sub')}`
- `'Setup starten'` → `{t('onboarding.start_setup')}`

**TwitchStep.tsx** — Replace all strings with existing `twitch.*` keys.

**ObsStep.tsx** — Replace all strings with existing `obs.*` keys.

**NotionStep.tsx** — Replace all strings with existing `notion.*` keys.

**OverlaysStep.tsx** — Replace all strings with existing `overlays.*` keys.

**StreamDeckStep.tsx** — Replace all strings with existing `streamdeck.*` keys.

**DoneStep.tsx** — Replace all strings with existing `done.*` keys.

Pattern for each file:
```tsx
import { useTranslation } from '../../i18n/LanguageContext';

export default function XStep() {
  const { t } = useTranslation();
  // replace hardcoded German strings with t('key') calls
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/onboarding/
git commit -m "feat(i18n): wire up all onboarding steps to use t()"
```

---

### Task 4: Wire up Stream tab panels

**Files:**
- Modify: `src/renderer/src/panels/ChallengePanel.tsx`
- Modify: `src/renderer/src/panels/IssuesPanel.tsx`
- Modify: `src/renderer/src/panels/ClipsPanel.tsx`
- Modify: `src/renderer/src/panels/DesignsPanel.tsx`
- Modify: `src/renderer/src/panels/SongPanel.tsx`
- Modify: `src/renderer/src/panels/RaidsPanel.tsx`
- Modify: `src/renderer/src/panels/ChatPanel.tsx`

- [ ] **Step 1: Update all stream tab panels**

Add `import { useTranslation } from '../i18n/LanguageContext'` and `const { t } = useTranslation()` to each panel. Replace hardcoded strings.

**ChallengePanel.tsx** — ~13 strings:
- Panel desc, placeholder, button labels ("Los!", "Geschafft", "Nicht geschafft", "Abbrechen")
- Status labels ("Läuft", "Geschafft!", "Gescheitert")
- Timer button titles ("Pausieren", "Weiter")
- ChatCommands desc strings

**IssuesPanel.tsx** — ~9 strings:
- Panel desc, placeholder, button states ("Spinning...", "Cooldown Xs", "Drehen!")
- Section headers ("Offen", "Gefixt")
- ChatCommands desc

**ClipsPanel.tsx** — ~5 strings:
- Placeholder "Notiz (optional)...", "+ Clip", "Keine Clips", "Heute"
- Filter empty state with dynamic tag name

**DesignsPanel.tsx** — ~12 strings:
- Panel desc, placeholder, vote labels, button labels
- Section headers, ChatCommands descs

**SongPanel.tsx** — ~4 strings:
- Panel desc, placeholder, "Übernehmen", "Löschen"

**RaidsPanel.tsx** — ~3 strings:
- Panel desc, "Noch keine Raids", "Zuschauer"

**ChatPanel.tsx** — ~1 string:
- "Verbinde zuerst Twitch in den Settings."

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/panels/ChallengePanel.tsx src/renderer/src/panels/IssuesPanel.tsx src/renderer/src/panels/ClipsPanel.tsx src/renderer/src/panels/DesignsPanel.tsx src/renderer/src/panels/SongPanel.tsx src/renderer/src/panels/RaidsPanel.tsx src/renderer/src/panels/ChatPanel.tsx
git commit -m "feat(i18n): wire up stream tab panels to use t()"
```

---

### Task 5: Wire up Projekt/Stats/Settings tab panels

**Files:**
- Modify: `src/renderer/src/panels/TodosPanel.tsx`
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`
- Modify: `src/renderer/src/panels/MilestonesPanel.tsx`
- Modify: `src/renderer/src/panels/StatsPanel.tsx`
- Modify: `src/renderer/src/panels/SettingsPanel.tsx`

- [ ] **Step 1: Update project + stats panels**

**TodosPanel.tsx** — ~4 strings:
- Panel desc, placeholder, "Keine Todos", "Erledigt"

**ProgressPanel.tsx** — ~4 strings:
- Placeholders, "Kein Projekt", ChatCommands desc

**MilestonesPanel.tsx** — ~2 strings:
- "Keine offenen Milestones", "Erledigt"

**StatsPanel.tsx** — ~12 strings:
- Loading text, desc, all 10 stat card labels

- [ ] **Step 2: Update SettingsPanel.tsx**

SettingsPanel already imports `useTranslation` and uses `t()` for some keys. Replace ALL remaining hardcoded strings (~35 strings). The panel already has `const { t, lang, setLang } = useTranslation()`.

Key replacements:
- Line 125: `'Twitch-Verbindung konfigurieren...'` → `{t('settings.desc')}`
- Line 128: `'Twitch Verbindung'` → `{t('settings.twitch')}`
- Line 132: Conditional with `'Verbunden mit'` / `'Nicht verbunden'` → use `t('settings.connected_to')` + channel / `t('settings.not_connected')`
- Line 137: Step 1 text → `{t('settings.twitch_step1')}`
- Line 141: placeholder → `t('settings.twitch_placeholder')`
- Line 157: `'🔌 Trennen'` → `{t('settings.disconnect')}`
- Line 164: `'🔗 Mit Twitch verbinden'` → `{t('settings.connect_twitch')}`
- Line 178: `'Client-ID ändern'` → `{t('settings.change_client_id')}`
- Line 184: `'Notion Integration'` → `{t('settings.notion')}`
- Line 185: Notion desc → `{t('settings.notion_desc')}`
- Line 212: `'Token ändern'` → `{t('settings.change_token')}`
- Line 216: Clips DB desc → `{t('settings.clips_db')}`
- Line 242: `'Database ändern'` → `{t('settings.change_db')}`
- Line 248: `'OBS Verbindung'` → `{t('settings.obs')}`
- Line 249: OBS desc → `{t('settings.obs_desc')}`
- Line 253: OBS connected/not → `t('settings.obs_connected')` / `t('settings.obs_not_connected')`
- Line 294: Password label → dynamic with `t('settings.obs_with_password')` / `t('settings.obs_without_password')`
- Line 303: `'🔌 OBS trennen'` → `{t('settings.obs_disconnect')}`
- Line 313: `'🔗 Mit OBS verbinden'` → `{t('settings.obs_connect')}`
- Line 325: `'Config ändern'` → `{t('settings.obs_change')}`
- Line 331-332: Stream Deck section → `{t('settings.streamdeck')}`, `{t('settings.streamdeck_desc')}`
- Line 336: Copy/Copied → `t('settings.copied')` / `t('settings.copy')`
- Line 339: Token loading → `{t('settings.token_loading')}`
- Line 348-349: Autostart → `{t('settings.autostart')}`, `{t('settings.autostart_desc')}`
- Line 358/367: Enabled/Disabled → `{t('settings.enabled')}` / `{t('settings.disabled')}`
- Line 373-374: Backup → `{t('settings.backup')}`, `{t('settings.backup_desc')}`
- Line 376/378: Export/Import buttons → `{t('settings.backup_export')}` / `{t('settings.backup_import')}`
- Line 44/48/64/66/70: Backup status messages → use `t()` keys
- Line 410-411: Design section → `{t('settings.design')}`, `{t('settings.design_desc')}`
- Notion/OBS input placeholders → `t()` keys

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/panels/TodosPanel.tsx src/renderer/src/panels/ProgressPanel.tsx src/renderer/src/panels/MilestonesPanel.tsx src/renderer/src/panels/StatsPanel.tsx src/renderer/src/panels/SettingsPanel.tsx
git commit -m "feat(i18n): wire up project/stats/settings panels to use t()"
```

---

### Task 6: Wire up remaining panels + components

**Files:**
- Modify: `src/renderer/src/panels/HotkeysPanel.tsx`
- Modify: `src/renderer/src/panels/OverlaysPanel.tsx`
- Modify: `src/renderer/src/panels/HelpPanel.tsx`
- Modify: `src/renderer/src/components/ErrorBoundary.tsx`
- Modify: `src/renderer/src/components/ChatCommands.tsx`

- [ ] **Step 1: Update HotkeysPanel.tsx**

Replace hardcoded `HOTKEY_LABELS` object with `t()` calls. Since it's a static object outside the component, move labels inside the component:

```tsx
const { t } = useTranslation();

const HOTKEY_LABELS: Record<string, string> = {
  challenge_toggle: t('hotkeys.challenge_toggle'),
  timer_toggle: t('hotkeys.timer_toggle'),
  hype_moment: t('hotkeys.hype_moment'),
  challenge_done: t('hotkeys.challenge_done'),
  challenge_failed: t('hotkeys.challenge_failed'),
  roulette: t('hotkeys.roulette'),
  milestone_minor: t('hotkeys.milestone_minor'),
  milestone_major: t('hotkeys.milestone_major'),
  milestone_epic: t('hotkeys.milestone_epic'),
};
```

Replace remaining strings: panel desc, section title, format hint, button labels, save confirmation, restart hint, loading text.

- [ ] **Step 2: Update OverlaysPanel.tsx**

Add `useTranslation`, replace ~15 hardcoded strings with existing `overlays_panel.*` keys plus new ones for guide steps, preview, file, close, etc.

- [ ] **Step 3: Update HelpPanel.tsx**

Will be updated together with Task 7 (help docs restructuring).

- [ ] **Step 4: Update ErrorBoundary.tsx**

Since ErrorBoundary is a class component and can't use hooks, add translated strings as props:

```tsx
interface Props {
  children: ReactNode;
  fallback?: string;
  errorTitle?: string;
  errorMessage?: string;
  retryLabel?: string;
}
```

In the render method, use the props with German fallbacks:
```tsx
<h2>⚠️ {this.props.fallback || this.props.errorTitle || 'Fehler'}</h2>
<p className="panel-desc">{this.props.errorMessage || 'Etwas ist schiefgelaufen.'}</p>
<button ...>{this.props.retryLabel || 'Nochmal versuchen'}</button>
```

In `App.tsx` where ErrorBoundary is used, pass translated props:
```tsx
<ErrorBoundary
  fallback={p.label}
  errorTitle={t('error.title')}
  errorMessage={t('error.message')}
  retryLabel={t('error.retry')}
>
```

- [ ] **Step 5: Update ChatCommands.tsx**

Replace hardcoded label:
```tsx
import { useTranslation } from '../i18n/LanguageContext';
// ...
const { t } = useTranslation();
// ...
{t('chatcmds.label')} {open ? '▾' : '▸'}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/panels/HotkeysPanel.tsx src/renderer/src/panels/OverlaysPanel.tsx src/renderer/src/components/ErrorBoundary.tsx src/renderer/src/components/ChatCommands.tsx src/renderer/src/App.tsx
git commit -m "feat(i18n): wire up remaining panels and components"
```

---

### Task 7: Restructure help documentation

**Files:**
- Create: `src/renderer/src/docs/help-de.ts`
- Create: `src/renderer/src/docs/help-en.ts`
- Modify: `src/renderer/src/docs/help.ts`
- Modify: `src/renderer/src/panels/HelpPanel.tsx`

- [ ] **Step 1: Create help-de.ts**

Move existing `HELP_SECTIONS` array from `help.ts` to `help-de.ts`:
```ts
export const HELP_SECTIONS_DE = [
  // ... exact same content from current help.ts
];
```

- [ ] **Step 2: Create help-en.ts**

Translate all 12 sections to English:
```ts
export const HELP_SECTIONS_EN = [
  {
    title: 'Getting Started',
    content: `The Stream Toolkit is your central hub for streaming. Control everything here — overlays, challenges, issues, clips, todos, milestones and more.
...`
  },
  // ... all 12 sections translated
];
```

- [ ] **Step 3: Update help.ts as router**

```ts
import { Lang } from '../i18n/translations';
import { HELP_SECTIONS_DE } from './help-de';
import { HELP_SECTIONS_EN } from './help-en';

export interface HelpSection {
  title: string;
  content: string;
}

export const HELP_SECTIONS: Record<Lang, HelpSection[]> = {
  de: HELP_SECTIONS_DE,
  en: HELP_SECTIONS_EN,
};
```

- [ ] **Step 4: Update HelpPanel.tsx**

```tsx
import { useTranslation } from '../i18n/LanguageContext';
import { HELP_SECTIONS } from '../docs/help';

export default function HelpPanel() {
  const { t, lang } = useTranslation();
  const sections = HELP_SECTIONS[lang];
  // ... render sections
}
```

Replace hardcoded title/desc with `t('help.title')` and `t('help.desc')`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/docs/ src/renderer/src/panels/HelpPanel.tsx
git commit -m "feat(i18n): restructure help docs with per-language files"
```

---

### Task 8: Typecheck & Verification

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 3: Search for remaining hardcoded German strings**

Search all panel and onboarding files for common German words that should have been translated:
```bash
grep -rn "Keine\|Erledigt\|Verbunden\|Nicht verbunden\|Wird geladen\|fehlgeschlagen\|Abstimmung\|Ändern\|Speichern\|Abbrechen" src/renderer/src/panels/ src/renderer/src/components/ --include="*.tsx" | grep -v "translations.ts\|node_modules"
```

Expected: Only strings inside `translations.ts` or the few intentional German-only strings (Deutsch/English buttons).

- [ ] **Step 4: Verify English mode works**

Start the app with `npm run dev`, switch language to English in Settings, verify:
- All panels show English text
- Onboarding wizard shows English (restart wizard from Settings)
- Help docs show English content
- No missing translation keys (would show as the key name instead of text)

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "feat(i18n): fix remaining translation issues"
```
