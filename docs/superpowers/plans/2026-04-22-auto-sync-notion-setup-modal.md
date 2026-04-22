# Auto-Sync Notion Setup Modal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user clicks the Auto-Sync toggle without Notion configured, open a modal with the NotionStep wizard. After setup, activate Auto-Sync with celebration.

**Architecture:** New `NotionSetupModal` component wraps existing `NotionStep`. `NotionStep` gets an `onComplete` prop forwarded to `NotionDatabasePicker`'s `onConfigured`. ClipsPanel toggle becomes always-visible and routes to the modal when unconfigured.

**Tech Stack:** React, TypeScript, CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/renderer/src/components/onboarding/NotionStep.tsx` | Add `onComplete` prop |
| Create | `src/renderer/src/components/NotionSetupModal.tsx` | Modal wrapper around NotionStep |
| Modify | `src/renderer/src/panels/ClipsPanel.tsx` | Always-visible toggle, modal open logic |
| Modify | `src/renderer/src/index.css` | Modal styles |

---

### Task 1: Add `onComplete` Prop to NotionStep

**Files:**
- Modify: `src/renderer/src/components/onboarding/NotionStep.tsx`

- [ ] **Step 1: Add props interface and forward onComplete**

Replace the entire file content with:

```tsx
import React, { useState } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/LanguageContext';
import NotionDatabasePicker from '../NotionDatabasePicker';

interface Props {
  onComplete?: () => void;
}

export default function NotionStep({ onComplete }: Props) {
  const { t } = useTranslation();
  const { data: notionInfo, refetch: refetchNotion } = useApi<{ configured: boolean }>('/settings/notion');
  const [token, setToken] = useState('');

  const saveToken = async () => {
    if (!token.trim()) return;
    await apiPost('/settings/notion', { token: token.trim() });
    setToken('');
    refetchNotion();
  };

  return (
    <div className="onboarding-step">
      <h2>{t('notion.title')}</h2>
      <p className="step-desc">{t('notion.desc')}</p>

      {!notionInfo?.configured ? (
        <>
          <div className="onboarding-steps-list">
            <div className="setup-instruction">
              <span className="instruction-number">1</span>
              <span>{t('notion.step1')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">2</span>
              <span>{t('notion.step2')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">3</span>
              <span>{t('notion.step3')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">4</span>
              <span>{t('notion.step4')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">5</span>
              <span>{t('notion.step5')}</span>
            </div>
          </div>

          <div className="input-row">
            <input
              type="text"
              placeholder={t('notion.token_placeholder')}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveToken()}
            />
            <button onClick={saveToken}>{t('settings.save')}</button>
          </div>

          <p className="step-hint">{t('notion.share_hint')}</p>
        </>
      ) : (
        <>
          <div className="onboarding-check">{t('notion.token_saved')}</div>
          <NotionDatabasePicker onConfigured={onComplete} />
        </>
      )}
    </div>
  );
}
```

The only changes from the original are:
- Added `Props` interface with optional `onComplete`
- Destructure `onComplete` from props
- Pass `onConfigured={onComplete}` to `NotionDatabasePicker` (line 64 originally had no prop)

This is backwards-compatible: existing onboarding usage passes no props and works as before.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/onboarding/NotionStep.tsx
git commit -m "feat(notion): add onComplete prop to NotionStep for modal reuse"
```

---

### Task 2: Create NotionSetupModal Component

**Files:**
- Create: `src/renderer/src/components/NotionSetupModal.tsx`

- [ ] **Step 1: Create the modal component**

Create the file with:

```tsx
import React, { useEffect } from 'react';
import NotionStep from './onboarding/NotionStep';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function NotionSetupModal({ open, onClose, onComplete }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="notion-setup-backdrop" onClick={onClose}>
      <div className="notion-setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-setup-modal-header">
          <span>Notion einrichten</span>
          <button className="notion-setup-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="notion-setup-modal-body">
          <NotionStep onComplete={onComplete} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/NotionSetupModal.tsx
git commit -m "feat(notion): create NotionSetupModal component"
```

---

### Task 3: Update ClipsPanel — Always-Visible Toggle + Modal

**Files:**
- Modify: `src/renderer/src/panels/ClipsPanel.tsx`

- [ ] **Step 1: Add imports, ref, and modal state**

At the top of `ClipsPanel.tsx`, add the import (after existing imports around line 8):

```tsx
import NotionSetupModal from '../components/NotionSetupModal';
```

Also add `useRef` to the React import on line 1:

```tsx
import React, { useState, useRef } from 'react';
```

Inside the component function, after the `tourEvent` state (line 60), add:

```tsx
const [notionModalOpen, setNotionModalOpen] = useState(false);
const autoSyncToggleRef = useRef<HTMLButtonElement>(null);
```

- [ ] **Step 2: Replace toggleAutoSync function**

Replace the existing `toggleAutoSync` function (lines 138-142) with:

```tsx
const toggleAutoSync = async () => {
  if (!notionConfigured) {
    if (!notionModalOpen) setNotionModalOpen(true);
    return;
  }
  const next = autoSync ? 'false' : 'true';
  await apiPost('/settings/set', { key: 'notion_auto_sync', value: next });
  refetchAutoSync();
};

const handleNotionSetupComplete = async () => {
  setNotionModalOpen(false);
  await apiPost('/settings/set', { key: 'notion_auto_sync', value: 'true' });
  refetchAutoSync();
  // Refetch dbInfo so notionConfigured updates
  // (useApi auto-refetches on WebSocket events, but force it for immediate UI update)
  if (autoSyncToggleRef.current) celebrate('success', autoSyncToggleRef.current);
  toast.success('Notion verbunden — Auto-Sync aktiv');
};
```

- [ ] **Step 3: Make toggle always visible and add ref**

In the JSX, replace the toggle button block (lines 204-208):

```tsx
{notionConfigured && (
  <button className={`auto-sync-toggle ${autoSync ? 'on' : 'off'}`} onClick={toggleAutoSync} title={t('clips.auto_sync_label')}>
    ☁️ {t('clips.auto_sync_label')}: {autoSync ? t('clips.auto_sync_on') : t('clips.auto_sync_off')}
  </button>
)}
```

With:

```tsx
<button
  ref={autoSyncToggleRef}
  className={`auto-sync-toggle ${notionConfigured && autoSync ? 'on' : 'off'}`}
  onClick={toggleAutoSync}
  title={t('clips.auto_sync_label')}
>
  ☁️ {t('clips.auto_sync_label')}: {notionConfigured && autoSync ? t('clips.auto_sync_on') : t('clips.auto_sync_off')}
</button>
```

- [ ] **Step 4: Add modal to JSX**

Just before the closing `</div>` of the panel (line 356, before `</div>`), add:

```tsx
<NotionSetupModal
  open={notionModalOpen}
  onClose={() => setNotionModalOpen(false)}
  onComplete={handleNotionSetupComplete}
/>
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/panels/ClipsPanel.tsx
git commit -m "feat(clips): always show auto-sync toggle, open notion modal when unconfigured"
```

---

### Task 4: CSS Styles for Notion Setup Modal

**Files:**
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Add modal styles**

Append to the end of `src/renderer/src/index.css` (reuses the visual pattern from `.ov2-modal-backdrop` / `.ov2-modal`):

```css
/* Notion Setup Modal */
.notion-setup-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.notion-setup-modal {
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  width: 560px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
}

.notion-setup-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 1.1rem;
  font-weight: 600;
}

.notion-setup-modal-close {
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  font-size: 1.2rem;
  padding: 4px 8px;
  opacity: 0.6;
}

.notion-setup-modal-close:hover {
  opacity: 1;
}

.notion-setup-modal-body .onboarding-step {
  padding: 0;
}

.notion-setup-modal-body .onboarding-step h2 {
  display: none;
}

[data-theme="light"] .notion-setup-modal { background: #fff; border-color: #e0e0e0; }
```

Note: The `.onboarding-step h2` is hidden inside the modal because the modal header already shows the title.

- [ ] **Step 2: Visually verify**

Run: `npm run dev`
Expected: Auto-Sync toggle is always visible. Clicking it without Notion configured opens a modal with the Notion setup wizard. Completing setup closes the modal with celebration and activates Auto-Sync.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style: add notion setup modal styles"
```

---

### Task 5: End-to-End Verification

- [ ] **Step 1: No Notion configured flow**

1. Ensure no Notion token/DB is set (or remove via Settings)
2. Go to Clip Moments panel
3. Auto-Sync toggle should show "Aus"
4. Click toggle → modal opens with NotionStep wizard
5. Enter token, select DB
6. Modal closes, celebration fires on toggle, toast shows
7. Toggle now shows "An"

- [ ] **Step 2: Close without completing**

1. Click toggle (no Notion) → modal opens
2. Click X or ESC or backdrop
3. Modal closes, toggle still shows "Aus", nothing changed

- [ ] **Step 3: Already configured flow**

1. With Notion configured, toggle should work as before (on/off)
2. No modal opens

- [ ] **Step 4: Onboarding still works**

1. Verify the onboarding NotionStep still functions (no onComplete prop = old behavior)
