# Error Handling & Input Validation — Critical Fixes

## Overview

Fix critical error handling gaps and input validation issues across the API layer. Standardize error response format. Add error state to the renderer's `useApi` hook.

## Components

### 1. OBS API — Try-Catch on Async Routes

**File:** `src/server/api/obs.ts`

Two routes call async OBS functions without try-catch:

**GET `/scenes`** (line 66):
```typescript
router.get('/scenes', async (_req, res) => {
  const scenes = await getScenes();       // crashes if OBS not connected
  const current = await getCurrentScene(); // crashes if OBS not connected
  res.json({ scenes, current });
});
```
Fix: wrap in try-catch, return `{ error: 'OBS not connected or unreachable' }` with status 503.

**POST `/scene`** (line 72):
```typescript
const result = await changeScene(scene);  // crashes if OBS not connected
```
Fix: wrap the `await changeScene()` call in try-catch.

### 2. Custom Overlays — HTML Validation

**File:** `src/server/api/custom-overlays.ts`

**PUT `/:name`** (line 176): Writes `req.body.html` to disk without checking if it's a non-empty string.

Fix: Add validation before `fs.writeFileSync`:
```typescript
if (!html || typeof html !== 'string') {
  res.status(400).json({ error: 'html field is required and must be a string' });
  return;
}
```

### 3. Progress API — Timer Seconds Validation

**File:** `src/server/api/progress.ts`

**PATCH `/items/:id`** (line 86): `current_timer_seconds` is used without type checking. If a non-numeric value is passed, it gets stored as-is in SQLite.

Fix: Add validation after the status enum check:
```typescript
if (current_timer_seconds !== undefined && (typeof current_timer_seconds !== 'number' || !Number.isFinite(current_timer_seconds))) {
  res.status(400).json({ error: 'current_timer_seconds must be a number' });
  return;
}
```

### 4. Settings API — Onboarding Validation

**File:** `src/server/api/settings.ts`

**POST `/onboarding`** (line 174): The `completed` field is truthy-checked but not validated as boolean. The current code works (truthy = 'true', falsy = 'false') but accepts any type silently.

Fix: Validate that `completed` is present:
```typescript
if (completed === undefined) {
  res.status(400).json({ error: 'completed field is required' });
  return;
}
```

### 5. WebSocket Error Cleanup

**File:** `src/server/websocket/index.ts`

The `ws.on('close')` handler removes the socket from `authenticatedClients` (line 31-34). But there's no `ws.on('error')` handler — if a socket errors without closing cleanly, it could remain in the set.

Fix: Add error handler after the close handler:
```typescript
ws.on('error', () => {
  authenticatedClients.delete(ws);
});
```

### 6. Standardized Error Response Format

All error responses should follow `{ error: string }`. Currently some endpoints return:
- `{ error: "msg", details: "..." }` 
- `{ success: false, error: "msg" }`

Fix: Audit all error responses in the files we're already touching and standardize to `{ error: string }`. Don't touch files we're not modifying — incremental improvement.

### 7. useApi Error State

**File:** `src/renderer/src/hooks/useApi.ts`

The `useApi` hook catches errors but only logs them. Panels have no way to know if a fetch failed.

Fix: Add `error` state to the hook:
```typescript
export function useApi<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ... existing fetch logic ...
      setData(json);
    } catch (err) {
      console.error(`[useApi] ${endpoint}:`, err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}
```

Note: Existing callers destructure `{ data, loading, refetch }` — adding `error` is non-breaking. Panels can opt-in to displaying errors when they choose.

## Files to Modify

| File | Change |
|------|--------|
| `src/server/api/obs.ts` | Try-catch on GET /scenes and POST /scene |
| `src/server/api/custom-overlays.ts` | Validate html in PUT handler |
| `src/server/api/progress.ts` | Validate current_timer_seconds |
| `src/server/api/settings.ts` | Validate completed in onboarding |
| `src/server/websocket/index.ts` | Add ws error handler for cleanup |
| `src/renderer/src/hooks/useApi.ts` | Add error state to useApi hook |

## Out of Scope

- Validating all endpoints (only fixing critical gaps)
- Adding zod or schema-based validation middleware
- Rate limiting on public endpoints
- Database indexes / foreign keys (separate topic)
