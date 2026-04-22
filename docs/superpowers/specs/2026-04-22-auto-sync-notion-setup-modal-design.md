# Auto-Sync Notion Setup Modal

When the user clicks the Auto-Sync toggle in ClipsPanel without Notion configured, a modal opens with the existing NotionStep wizard. After successful setup, Auto-Sync activates automatically with a celebration.

## Toggle Behavior

The Auto-Sync toggle in ClipsPanel header is always visible (remove `notionConfigured` guard).

- **Notion configured:** Toggle works as before (on/off, sets `notion_auto_sync`)
- **Notion not configured:** Click opens `NotionSetupModal` instead of toggling the setting
- Toggle shows "Aus" while Notion is not configured

## NotionSetupModal Component

New component: thin modal wrapper around the existing `NotionStep`.

**Props:**
- `open: boolean`
- `onClose: () => void`
- `onComplete: () => void`

**Behavior:**
- Backdrop overlay (click-outside closes)
- X button to close
- ESC key closes
- Embeds `NotionStep` as content
- `NotionStep` already handles its own step navigation (token input, DB picker)
- When `NotionStep` calls `onComplete` (DB selected) -> modal calls its own `onComplete`

## Completion Flow

1. User selects DB in NotionStep picker -> `onComplete` fires
2. Modal closes
3. ClipsPanel sets `notion_auto_sync` to `"true"` via `POST /settings/set`
4. `celebrate('success', null)` fires
5. Toast: "Notion verbunden — Auto-Sync aktiv"
6. ClipsPanel refetches `notionConfigured` and `autoSync` -> toggle shows "An"

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User closes modal without completing | Nothing changes, Auto-Sync stays off |
| Token exists but no DB | NotionStep auto-advances past token step to DB picker |
| User disables Auto-Sync later | Toggle works normally (Notion is configured) |
| User removes Notion token in Settings | Toggle reverts to "not configured" behavior, click reopens modal |

## Files to Change

- Create: `src/renderer/src/components/NotionSetupModal.tsx` — modal wrapper
- Modify: `src/renderer/src/panels/ClipsPanel.tsx` — always show toggle, open modal when unconfigured
- Modify: `src/renderer/src/index.css` — modal overlay styles (if not already existing)
