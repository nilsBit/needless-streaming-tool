# Onboarding Wizard Polish — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix navigation, error handling, i18n, loading states, validation, and accessibility across all onboarding wizard steps.

**Architecture:** Incremental polish across 10 existing files. No new files. Parent wizard gets proper next-button logic for all steps. Step components get toast errors, loading states, and accessibility attributes.

**Tech Stack:** React, TypeScript, i18n translations

**Spec:** `docs/superpowers/specs/2026-04-27-onboarding-polish-design.md`

---

## File Map

| Action | File | Changes |
|--------|------|---------|
| Modify | `src/renderer/src/components/OnboardingWizard.tsx` | i18n step labels, navigation for all steps, status-aware next button |
| Modify | `src/renderer/src/components/onboarding/TwitchStep.tsx` | Toast errors, loading state, button disabled |
| Modify | `src/renderer/src/components/onboarding/ObsStep.tsx` | Toast errors, loading state, port input type, i18n placeholders |
| Modify | `src/renderer/src/components/onboarding/NotionStep.tsx` | Toast errors, loading state, format hint |
| Modify | `src/renderer/src/components/onboarding/StreamDeckStep.tsx` | Toast error (replace empty catch) |
| Modify | `src/renderer/src/components/onboarding/OverlaysStep.tsx` | Loading state |
| Modify | `src/renderer/src/components/onboarding/LanguageStep.tsx` | Accessibility |
| Modify | `src/renderer/src/components/onboarding/WelcomeStep.tsx` | Accessibility |
| Modify | `src/renderer/src/components/onboarding/DoneStep.tsx` | Accessibility, status text |
| Modify | `src/renderer/src/i18n/translations.ts` | Step label keys, new strings |

---

## Task 1: i18n Keys + Translations

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Add step label i18n keys and new onboarding strings**

Find the existing onboarding section in translations.ts and add step label keys. Also add error/status strings needed by other tasks.

Add these keys (find the onboarding section and add nearby):

```typescript
  // Onboarding step labels
  'onboarding.step.language': { de: 'Sprache', en: 'Language' },
  'onboarding.step.profile': { de: 'Profil', en: 'Profile' },
  'onboarding.step.welcome': { de: 'Willkommen', en: 'Welcome' },
  'onboarding.step.twitch': { de: 'Twitch', en: 'Twitch' },
  'onboarding.step.obs': { de: 'OBS', en: 'OBS' },
  'onboarding.step.notion': { de: 'Notion', en: 'Notion' },
  'onboarding.step.overlays': { de: 'Overlays', en: 'Overlays' },
  'onboarding.step.streamdeck': { de: 'Stream Deck', en: 'Stream Deck' },
  'onboarding.step.done': { de: 'Fertig', en: 'Done' },

  // Onboarding error/status strings
  'onboarding.save_failed': { de: 'Speichern fehlgeschlagen', en: 'Save failed' },
  'onboarding.connect_failed': { de: 'Verbindung fehlgeschlagen', en: 'Connection failed' },
  'onboarding.install_failed': { de: 'Installation fehlgeschlagen', en: 'Installation failed' },
  'onboarding.loading': { de: 'Laden...', en: 'Loading...' },
  'onboarding.connected': { de: 'Verbunden', en: 'Connected' },
  'onboarding.not_connected': { de: 'Nicht verbunden', en: 'Not connected' },

  // OBS placeholders
  'obs.host_placeholder': { de: 'Host (localhost)', en: 'Host (localhost)' },
  'obs.port_placeholder': { de: 'Port (4455)', en: 'Port (4455)' },

  // Notion format hint
  'notion.token_format_hint': { de: 'Token beginnt mit ntn_ oder secret_', en: 'Token starts with ntn_ or secret_' },
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "feat(i18n): add onboarding step labels and error strings"
```

---

## Task 2: Wizard Navigation + Step Components (Error Handling, Loading, Validation)

**Files:**
- Modify: `src/renderer/src/components/OnboardingWizard.tsx`
- Modify: `src/renderer/src/components/onboarding/TwitchStep.tsx`
- Modify: `src/renderer/src/components/onboarding/ObsStep.tsx`
- Modify: `src/renderer/src/components/onboarding/NotionStep.tsx`
- Modify: `src/renderer/src/components/onboarding/StreamDeckStep.tsx`
- Modify: `src/renderer/src/components/onboarding/OverlaysStep.tsx`

- [ ] **Step 1: Fix OnboardingWizard.tsx — i18n step labels + navigation**

Replace the STEPS and SKIPPABLE constants:
```typescript
const STEPS = ['Language', 'Profil', 'Welcome', 'Twitch', 'OBS', 'Notion', 'Overlays', 'Stream Deck', 'Fertig'];
const SKIPPABLE = new Set([5, 7]); // Notion, Stream Deck (shifted +1 by Profile step)
```
With:
```typescript
const STEP_KEYS = [
  'onboarding.step.language', 'onboarding.step.profile', 'onboarding.step.welcome',
  'onboarding.step.twitch', 'onboarding.step.obs', 'onboarding.step.notion',
  'onboarding.step.overlays', 'onboarding.step.streamdeck', 'onboarding.step.done',
] as const;
const SKIPPABLE = new Set([5, 7]); // Notion, Stream Deck
```

Update the step indicator to use translated labels:
```typescript
{STEP_KEYS.map((key, i) => (
  <div
    key={key}
    className={`step-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
    title={t(key)}
  />
))}
```

Update step count references: replace `STEPS.length` with `STEP_KEYS.length`.

- [ ] **Step 2: Fix TwitchStep.tsx — toast errors + loading state**

Add imports:
```typescript
import { useToast } from '../../i18n/ToastContext';
```

Add in component:
```typescript
const { toast } = useToast();
const [saving, setSaving] = useState(false);
```

Replace `saveClientId`:
```typescript
  const saveClientId = async () => {
    if (!clientId.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/auth/twitch/client-id', {
        method: 'POST',
        body: JSON.stringify({ client_id: clientId.trim() }),
      });
      setClientId('');
      refetchClientId();
    } catch {
      toast.error(t('onboarding.save_failed'));
    }
    setSaving(false);
  };
```

Replace `connectTwitch`:
```typescript
  const connectTwitch = async () => {
    try {
      await apiFetch('/auth/twitch/open', { method: 'POST' });
    } catch {
      toast.error(t('onboarding.connect_failed'));
    }
  };
```

Disable save button when empty or saving:
```typescript
<button onClick={saveClientId} disabled={!clientId.trim() || saving}>
  {saving ? t('onboarding.loading') : t('settings.save')}
</button>
```

- [ ] **Step 3: Fix ObsStep.tsx — toast errors + loading state + port input + i18n placeholders**

Add imports:
```typescript
import { useToast } from '../../i18n/ToastContext';
```

Add in component:
```typescript
const { toast } = useToast();
const [connecting, setConnecting] = useState(false);
```

Replace `saveAndConnect`:
```typescript
  const saveAndConnect = async () => {
    setConnecting(true);
    try {
      await apiPost('/obs/config', {
        host: host.trim() || 'localhost',
        port: parseInt(port) || 4455,
        password,
      });
      refetchConfig();
      await apiPost('/obs/connect', {});
      refetchStatus();
    } catch {
      toast.error(t('onboarding.connect_failed'));
    }
    setConnecting(false);
  };
```

Update port input type and placeholders:
```typescript
<input type="text" placeholder={t('obs.host_placeholder')} value={host} onChange={(e) => setHost(e.target.value)} style={{ flex: 2 }} />
<input type="number" placeholder={t('obs.port_placeholder')} value={port} onChange={(e) => setPort(e.target.value)} min="1" max="65535" style={{ flex: 1 }} />
```

Disable connect button during connection:
```typescript
<button className="btn-primary" onClick={saveAndConnect} disabled={connecting}>
  {connecting ? t('onboarding.loading') : t('obs.connect_btn')}
</button>
```

- [ ] **Step 4: Fix NotionStep.tsx — toast errors + loading state + format hint**

Add imports:
```typescript
import { useToast } from '../../i18n/ToastContext';
```

Add in component:
```typescript
const { toast } = useToast();
const [saving, setSaving] = useState(false);
```

Replace `saveToken`:
```typescript
  const saveToken = async () => {
    if (!token.trim()) return;
    setSaving(true);
    try {
      await apiPost('/settings/notion', { token: token.trim() });
      setToken('');
      refetchNotion();
    } catch {
      toast.error(t('onboarding.save_failed'));
    }
    setSaving(false);
  };
```

Disable save button:
```typescript
<button onClick={saveToken} disabled={!token.trim() || saving}>
  {saving ? t('onboarding.loading') : t('settings.save')}
</button>
```

Add format hint after the input row:
```typescript
<p className="step-hint" style={{ fontSize: '11px', marginTop: '4px' }}>{t('notion.token_format_hint')}</p>
```

- [ ] **Step 5: Fix StreamDeckStep.tsx — replace empty catch**

Add imports:
```typescript
import { useToast } from '../../i18n/ToastContext';
```

Add in component:
```typescript
const { toast } = useToast();
```

Replace the empty catch in `installPlugin`:
```typescript
    } catch {
      toast.error(t('onboarding.install_failed'));
    }
```

- [ ] **Step 6: Fix OverlaysStep.tsx — loading state**

Update the useApi destructuring:
```typescript
const { data: overlays, loading } = useApi<OverlayInfo[]>('/overlays/builtin');
```

Add loading display before the overlay list:
```typescript
{loading ? (
  <p className="step-hint">{t('onboarding.loading')}</p>
) : (
  <div className="overlay-list-onboarding">
    {overlays?.map((o) => (
      <div key={o.name} className="overlay-item-onboarding">
        <span>{o.name}</span>
        <CopyButton text={o.url} />
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 7: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/OnboardingWizard.tsx src/renderer/src/components/onboarding/TwitchStep.tsx src/renderer/src/components/onboarding/ObsStep.tsx src/renderer/src/components/onboarding/NotionStep.tsx src/renderer/src/components/onboarding/StreamDeckStep.tsx src/renderer/src/components/onboarding/OverlaysStep.tsx
git commit -m "fix(onboarding): error handling, loading states, validation, navigation"
```

---

## Task 3: Accessibility

**Files:**
- Modify: `src/renderer/src/components/onboarding/LanguageStep.tsx`
- Modify: `src/renderer/src/components/onboarding/WelcomeStep.tsx`
- Modify: `src/renderer/src/components/onboarding/DoneStep.tsx`
- Modify: `src/renderer/src/components/onboarding/TwitchStep.tsx`
- Modify: `src/renderer/src/components/onboarding/ObsStep.tsx`

- [ ] **Step 1: Fix emoji accessibility in LanguageStep**

Replace:
```typescript
<div className="welcome-icon">🌐</div>
```
With:
```typescript
<div className="welcome-icon" role="img" aria-label="Language">🌐</div>
```

- [ ] **Step 2: Fix emoji accessibility in WelcomeStep**

Replace:
```typescript
<div className="welcome-icon">🔬</div>
```
With:
```typescript
<div className="welcome-icon" role="img" aria-label="Welcome">🔬</div>
```

- [ ] **Step 3: Fix emoji accessibility and status text in DoneStep**

Replace:
```typescript
<div className="welcome-icon">{canFinish ? '🎉' : '⚠️'}</div>
```
With:
```typescript
<div className="welcome-icon" role="img" aria-label={canFinish ? 'Ready' : 'Warning'}>{canFinish ? '🎉' : '⚠️'}</div>
```

- [ ] **Step 4: Add status text next to dots in TwitchStep**

Replace:
```typescript
<span className="status-dot" style={{ background: botStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
<span>{botStatus?.connected ? `${t('settings.connected_to')} #${botStatus.channel}` : t('settings.not_connected')}</span>
```
With:
```typescript
<span className="status-dot" style={{ background: botStatus?.connected ? '#2ecc71' : '#e74c3c' }} aria-hidden="true" />
<span>{botStatus?.connected ? `${t('settings.connected_to')} #${botStatus.channel}` : t('settings.not_connected')}</span>
```

- [ ] **Step 5: Add status text next to dots in ObsStep**

Replace:
```typescript
<span className="status-dot" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
```
With:
```typescript
<span className="status-dot" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} aria-hidden="true" />
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/onboarding/LanguageStep.tsx src/renderer/src/components/onboarding/WelcomeStep.tsx src/renderer/src/components/onboarding/DoneStep.tsx src/renderer/src/components/onboarding/TwitchStep.tsx src/renderer/src/components/onboarding/ObsStep.tsx
git commit -m "fix(onboarding): accessibility for emojis and status indicators"
```

---

## Task 4: E2E Verification

- [ ] **Step 1: Typecheck**
Run: `npm run typecheck`

- [ ] **Step 2: Lint**
Run: `npm run lint`

- [ ] **Step 3: Manual verification**
Open the app, reset onboarding (`DELETE FROM settings WHERE key = 'onboarding_completed'`), and walk through all steps checking:
- Step labels translate correctly
- Next button works on every step
- Error toasts appear on API failures
- Loading states show on buttons
- OBS port input only accepts numbers
