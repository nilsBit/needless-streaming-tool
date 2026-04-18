# GitHub Issues Import

**Date:** 2026-04-18
**Status:** Approved

## Goal

Import open GitHub issues into the Kanban board as project items. Supports re-sync to pull new issues without duplicates. Auth via Personal Access Token stored in Settings.

## Architecture

New `external_id` column on `project_items` tracks which items came from GitHub (format: `github:owner/repo#42`). Import endpoint fetches open issues from GitHub REST API, skips existing ones, and inserts new ones as `pending` items. Re-sync uses the same endpoint — duplicates are detected by `external_id`.

## DB Change

**Add column to `project_items`:**
```sql
ALTER TABLE project_items ADD COLUMN external_id TEXT;
```

Migration v9. Update SCHEMA DDL for fresh installs.

**Update `ProjectItem` interface:**
```ts
external_id: string | null;
```

## API

### POST `/api/progress/import/github` (new)

**Request body:**
```json
{ "owner": "nilsBit", "repo": "stream-toolkit" }
```

**Logic:**
1. Read `github_token` from settings table
2. If no token: return 400 `{ error: 'GitHub token not configured' }`
3. Fetch `GET https://api.github.com/repos/{owner}/{repo}/issues?state=open&per_page=100` with header `Authorization: Bearer {token}`
4. Filter out pull requests (items where `pull_request` field exists)
5. For each issue:
   - Compute `external_id = "github:{owner}/{repo}#{number}"`
   - Check if `external_id` already exists in `project_items`
   - If not: INSERT with `title = issue.title`, `status = 'pending'`, `external_id`
6. Broadcast `progress-update`
7. Return `{ imported: N, skipped: M, total: N+M }`

**Error handling:**
- GitHub API 401 → return 401 `{ error: 'GitHub token invalid' }`
- GitHub API 404 → return 404 `{ error: 'Repository not found' }`
- Network error → return 502 `{ error: 'GitHub API unavailable' }`

### Settings endpoints (existing pattern)

**POST `/api/settings/github`** — Save token
- Body: `{ token: "ghp_..." }`
- Stores in settings table as key `github_token`

**GET `/api/settings/github`** — Get status
- Returns `{ configured: boolean, preview: string | null }` (token masked)

## Settings UI

New section in SettingsPanel: **"GitHub Import"**

- Token input (password field) + save button
- If configured: show masked token preview + "Change token" button
- Repo input: `owner/repo` format
- "Import" button → POST to import endpoint → toast with result
- "Re-Sync" button → same endpoint (skips existing, imports new)
- Last repo saved in settings as `github_repo` for convenience

## Translation Keys (~8)

```
github.title — "GitHub Import" / "GitHub Import"
github.desc — "Issues aus einem GitHub-Repository importieren." / "Import issues from a GitHub repository."
github.token_placeholder — "GitHub Personal Access Token (ghp_...)" / "GitHub Personal Access Token (ghp_...)"
github.repo_placeholder — "owner/repo" / "owner/repo"
github.import_btn — "📥 Importieren" / "📥 Import"
github.sync_btn — "🔄 Re-Sync" / "🔄 Re-Sync"
github.imported — "importiert" / "imported"
github.skipped — "übersprungen" / "skipped"
```

## Affected Files

| Category | Files |
|----------|-------|
| DB | `src/server/db/schema.ts` (DDL v9), `src/server/db/index.ts` (migration) |
| Types | `src/shared/types.ts` (external_id on ProjectItem) |
| API | `src/server/api/progress.ts` (import endpoint + settings endpoints) |
| UI | `src/renderer/src/panels/SettingsPanel.tsx` (GitHub section) |
| i18n | `src/renderer/src/i18n/translations.ts` (~8 new keys) |

## What Does NOT Change

- Kanban board (imported items appear in Backlog automatically)
- Timer linking logic
- Progress overlay
- Existing project_items without external_id
- CSV export (external_id not included)
- Bot commands

## Risk

- Low: additive feature, no existing behavior changes
- GitHub API rate limit: 5000 req/hour with token — more than enough for manual import
- Token security: stored in settings table (not encrypted via safeStorage since it's server-side, but only accessible via authenticated API)
