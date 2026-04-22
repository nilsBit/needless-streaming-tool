# Stream-Profil — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profil-Auswahl im Onboarding + Settings, die Panel-Sichtbarkeit nach Streaming-Typ steuert.

**Architecture:** Profil-Preset-Map definiert welche Panels pro Profil sichtbar sind. `applyProfilePreset()` schreibt `hidden`-Arrays direkt in localStorage. Profil-Key in Settings-DB. Neuer Wizard-Step + Settings-Section.

**Tech Stack:** React, TypeScript, localStorage, bestehende Settings-API

**Spec:** `docs/superpowers/specs/2026-04-22-stream-profile-design.md`

**Convention note:** Keine automatisierten Tests. Verifikation per `npm run typecheck`, `npm run lint`, manuelles QA.

---

### Task 1: i18n-Keys

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Profil-Keys einfügen**

Suche den `// ---- Guided Tour ----` Kommentar. Füge **davor** ein:

```ts
  // ---- Stream Profile ----
  'profile.title': { de: 'Was streamst du?', en: 'What do you stream?' },
  'profile.subtitle': { de: 'Wir zeigen dir nur die Features die du brauchst.', en: 'We\'ll show you only the features you need.' },
  'profile.creative': { de: 'Kreativ', en: 'Creative' },
  'profile.creative_desc': { de: 'Art, Design, Musik — Fokus auf Projekte & Fortschritt', en: 'Art, design, music — focus on projects & progress' },
  'profile.gaming': { de: 'Gaming', en: 'Gaming' },
  'profile.gaming_desc': { de: 'Gameplay, Clips & Chat-Interaktion', en: 'Gameplay, clips & chat interaction' },
  'profile.coding': { de: 'Coding', en: 'Coding' },
  'profile.coding_desc': { de: 'Programmieren, Tasks & Issues tracken', en: 'Programming, tracking tasks & issues' },
  'profile.chatting': { de: 'Just Chatting', en: 'Just Chatting' },
  'profile.chatting_desc': { de: 'Unterhaltung, Abstimmungen & Musik', en: 'Entertainment, polls & music' },
  'profile.all': { de: 'Alles', en: 'Everything' },
  'profile.all_desc': { de: 'Alle Features sichtbar', en: 'All features visible' },
  'profile.settings_title': { de: 'Streaming-Profil', en: 'Streaming Profile' },
  'profile.settings_desc': { de: 'Ändert welche Panels sichtbar sind. Du kannst einzelne Panels jederzeit manuell ein-/ausblenden.', en: 'Changes which panels are visible. You can always show/hide individual panels manually.' },

```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "feat(i18n): add stream profile translation keys"
```

---

### Task 2: Profile Preset Logic

**Files:**
- Modify: `src/renderer/src/hooks/useDashboardLayout.ts`

- [ ] **Step 1: Preset-Map und applyProfilePreset exportieren**

Am Ende von `src/renderer/src/hooks/useDashboardLayout.ts` (nach dem schließenden `}` der `useDashboardLayout`-Funktion, vor dem impliziten File-Ende), füge ein:

```ts

// --- Stream Profile Presets ---
const ALL_STREAM_PANELS = ['challenge', 'issues', 'clips', 'designs', 'song'];
const ALL_PROJECT_PANELS = ['progress', 'milestones'];

const PROFILE_VISIBLE: Record<string, { stream: string[]; projekt: string[] }> = {
  creative: { stream: ['challenge', 'clips', 'song'], projekt: ['progress', 'milestones'] },
  gaming:   { stream: ['challenge', 'clips', 'issues', 'song'], projekt: [] },
  coding:   { stream: ['challenge', 'clips', 'issues'], projekt: ['progress', 'milestones'] },
  chatting: { stream: ['challenge', 'clips', 'designs', 'song'], projekt: [] },
  all:      { stream: ALL_STREAM_PANELS, projekt: ALL_PROJECT_PANELS },
};

export const PROFILE_KEYS = ['creative', 'gaming', 'coding', 'chatting', 'all'] as const;
export type ProfileKey = typeof PROFILE_KEYS[number];

export function applyProfilePreset(profile: string): void {
  const preset = PROFILE_VISIBLE[profile] || PROFILE_VISIBLE['all'];
  const layout: DashboardLayout = loadLayout();

  // Set hidden arrays for stream and projekt tabs
  const streamHidden = ALL_STREAM_PANELS.filter(k => !preset.stream.includes(k));
  const projektHidden = ALL_PROJECT_PANELS.filter(k => !preset.projekt.includes(k));

  layout['stream'] = {
    order: layout['stream']?.order || [...ALL_STREAM_PANELS],
    hidden: streamHidden,
    fullWidth: layout['stream']?.fullWidth || [],
  };
  layout['projekt'] = {
    order: layout['projekt']?.order || [...ALL_PROJECT_PANELS],
    hidden: projektHidden,
    fullWidth: layout['projekt']?.fullWidth || [],
  };

  saveLayout(layout);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useDashboardLayout.ts
git commit -m "feat(layout): add profile preset logic for panel visibility"
```

---

### Task 3: ProfileStep für Onboarding-Wizard

**Files:**
- Create: `src/renderer/src/components/onboarding/ProfileStep.tsx`

- [ ] **Step 1: ProfileStep erstellen**

```tsx
import React, { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { apiPost } from '../../hooks/useApi';
import { applyProfilePreset, PROFILE_KEYS, ProfileKey } from '../../hooks/useDashboardLayout';

const PROFILES: { key: ProfileKey; emoji: string; titleKey: string; descKey: string }[] = [
  { key: 'creative', emoji: '🎨', titleKey: 'profile.creative', descKey: 'profile.creative_desc' },
  { key: 'gaming', emoji: '🎮', titleKey: 'profile.gaming', descKey: 'profile.gaming_desc' },
  { key: 'coding', emoji: '💻', titleKey: 'profile.coding', descKey: 'profile.coding_desc' },
  { key: 'chatting', emoji: '🎙️', titleKey: 'profile.chatting', descKey: 'profile.chatting_desc' },
  { key: 'all', emoji: '⚙️', titleKey: 'profile.all', descKey: 'profile.all_desc' },
];

export default function ProfileStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ProfileKey>('all');

  const confirm = async () => {
    await apiPost('/settings/set', { key: 'stream_profile', value: selected });
    applyProfilePreset(selected);
    onNext();
  };

  return (
    <div className="onboarding-step">
      <h1>{t('profile.title')}</h1>
      <p className="welcome-text">{t('profile.subtitle')}</p>
      <div className="profile-grid">
        {PROFILES.map(p => (
          <button
            key={p.key}
            className={`profile-card ${selected === p.key ? 'active' : ''}`}
            onClick={() => setSelected(p.key)}
          >
            <span className="profile-card-emoji">{p.emoji}</span>
            <span className="profile-card-title">{t(p.titleKey as any)}</span>
            <span className="profile-card-desc">{t(p.descKey as any)}</span>
          </button>
        ))}
      </div>
      <button className="btn-primary" onClick={confirm} style={{ marginTop: '20px' }}>
        {t('onboarding.next')}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/onboarding/ProfileStep.tsx
git commit -m "feat(onboarding): create ProfileStep component"
```

---

### Task 4: ProfileStep in Wizard einbauen

**Files:**
- Modify: `src/renderer/src/components/OnboardingWizard.tsx`

- [ ] **Step 1: Import hinzufügen**

Suche:
```tsx
import LanguageStep from './onboarding/LanguageStep';
```

Füge **danach** ein:
```tsx
import ProfileStep from './onboarding/ProfileStep';
```

- [ ] **Step 2: STEPS und SKIPPABLE anpassen**

Suche:
```tsx
const STEPS = ['Language', 'Welcome', 'Twitch', 'OBS', 'Notion', 'Overlays', 'Stream Deck', 'Fertig'];
const SKIPPABLE = new Set([4, 6]); // Notion, Stream Deck (shifted +1)
```

Ersetze durch:
```tsx
const STEPS = ['Language', 'Profil', 'Welcome', 'Twitch', 'OBS', 'Notion', 'Overlays', 'Stream Deck', 'Fertig'];
const SKIPPABLE = new Set([5, 7]); // Notion, Stream Deck (shifted +1 by Profile step)
```

- [ ] **Step 3: Step-Rendering anpassen**

Suche:
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

Ersetze durch:
```tsx
          {step === 0 && <LanguageStep onNext={next} />}
          {step === 1 && <ProfileStep onNext={next} />}
          {step === 2 && <WelcomeStep onNext={next} />}
          {step === 3 && <TwitchStep />}
          {step === 4 && <ObsStep />}
          {step === 5 && <NotionStep />}
          {step === 6 && <OverlaysStep />}
          {step === 7 && <StreamDeckStep />}
          {step === 8 && <DoneStep onFinish={finish} />}
```

- [ ] **Step 4: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/OnboardingWizard.tsx
git commit -m "feat(onboarding): integrate ProfileStep as step 2 in wizard"
```

---

### Task 5: Profil-Auswahl in Settings

**Files:**
- Modify: `src/renderer/src/panels/SettingsPanel.tsx`

- [ ] **Step 1: Imports hinzufügen**

Suche:
```tsx
import NotionDatabasePicker from '../components/NotionDatabasePicker';
```

Füge **danach** ein:
```tsx
import { applyProfilePreset, PROFILE_KEYS, ProfileKey } from '../hooks/useDashboardLayout';
```

- [ ] **Step 2: State hinzufügen**

Suche:
```tsx
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['connections']));
```

Füge **davor** ein:
```tsx
  const { data: profileData, refetch: refetchProfile } = useApi<{ value: string | null }>('/settings/get/stream_profile');
  const currentProfile = (profileData?.value || 'all') as ProfileKey;
```

- [ ] **Step 3: Profil-Section in App-Gruppe einfügen**

Suche den Settings-Wizard-Abschnitt in der App-Gruppe:
```tsx
        <div className="settings-section">
          <h3>{t('settings.wizard')}</h3>
```

Füge **davor** ein:
```tsx
        <div className="settings-section">
          <h3>{t('profile.settings_title')}</h3>
          <p className="setup-info">{t('profile.settings_desc')}</p>
          <div className="profile-toggle">
            {PROFILE_KEYS.map(key => (
              <button
                key={key}
                className={`lang-btn ${currentProfile === key ? 'active' : ''}`}
                onClick={async () => {
                  await apiPost('/settings/set', { key: 'stream_profile', value: key });
                  applyProfilePreset(key);
                  refetchProfile();
                  window.location.reload();
                }}
              >
                {key === 'creative' ? '🎨' : key === 'gaming' ? '🎮' : key === 'coding' ? '💻' : key === 'chatting' ? '🎙️' : '⚙️'} {t(`profile.${key}` as any)}
              </button>
            ))}
          </div>
        </div>

```

- [ ] **Step 4: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/panels/SettingsPanel.tsx
git commit -m "feat(settings): add streaming profile selector in App group"
```

---

### Task 6: CSS für Profile-Karten

**Files:**
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Styles hinzufügen**

Am Ende von `src/renderer/src/index.css` einfügen:

```css
/* ---------- Stream Profile ---------- */
.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-top: 20px;
  max-width: 760px;
}
.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  border-radius: 10px;
  border: 2px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  text-align: center;
}
.profile-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); }
.profile-card.active { border-color: var(--accent, #4a9eff); background: rgba(74,158,255,0.1); }
.profile-card-emoji { font-size: 28px; }
.profile-card-title { font-weight: 600; font-size: 14px; }
.profile-card-desc { font-size: 11px; color: var(--muted, #888); line-height: 1.3; }

.profile-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

[data-theme="light"] .profile-card { border-color: rgba(0,0,0,0.12); background: rgba(0,0,0,0.02); }
[data-theme="light"] .profile-card:hover { border-color: rgba(0,0,0,0.2); background: rgba(0,0,0,0.04); }
[data-theme="light"] .profile-card.active { border-color: var(--accent); background: rgba(230,126,34,0.08); }
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style: add stream profile card and toggle styles"
```

---

### Task 7: Manuelles QA

- [ ] **Step 1: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 2: QA — Onboarding-Wizard**

1. Reset Onboarding: Settings → Setup-Wizard erneut starten
2. Step 1: Language → Deutsch
3. Step 2: **Profil** — 5 Karten sichtbar, "Alles" vorselektiert
4. Wähle "Gaming" → Weiter
5. Wizard durchklicken bis Ende
6. **Erwartung:** Stream-Tab zeigt nur Challenge, Clips, Issues, Song. Designs ist hidden. Projekt-Tab: Progress + Milestones sind hidden.

- [ ] **Step 3: QA — Settings-Profilwechsel**

1. Settings → App-Gruppe → Streaming-Profil
2. Aktuell "Gaming" highlighted
3. Klicke "Coding" → App reloaded
4. **Erwartung:** Stream-Tab: Challenge, Clips, Issues (Song hidden). Projekt-Tab: Progress, Milestones sichtbar.

- [ ] **Step 4: QA — Manuelles Override**

1. Im Stream-Tab: Hidden-Panels-Leiste → "Song" einblenden
2. Panel wechseln + zurück → Song bleibt sichtbar
3. In Settings → Profil auf "Alles" → reload
4. **Erwartung:** Alle Panels sichtbar

---

## Notes for Implementation

- **SKIPPABLE-Indices:** Nach Einfügen des Profile-Steps verschieben sich alle Indices um +1. Notion wird 5, Stream Deck wird 7.
- **State-Sync:** `applyProfilePreset` schreibt direkt in localStorage. In Settings löst `window.location.reload()` die Synchronisation aus. Im Wizard ist es kein Problem weil die App danach eh neu rendert.
- **Profil-Default:** Wenn `stream_profile` nicht in der DB existiert → Default `all` (alle Panels sichtbar).
- **`t()` mit dynamischen Keys:** ProfileStep und Settings nutzen `t(key as any)` — die Keys sind zur Compile-Zeit nicht als Literal bekannt. Das ist akzeptabel für diesen Anwendungsfall.
