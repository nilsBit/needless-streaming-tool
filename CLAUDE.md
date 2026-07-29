# Needless Streaming Tool (NST)

Electron Desktop App for Twitch streaming. Manages overlays, chat commands, stream data, and tooling for the "Needless Streaming Tool" (NST) stream brand.

## Tech Stack

- **Electron** — Desktop shell
- **TypeScript** — Everywhere (main, server, renderer, overlays)
- **React** — Renderer UI (Vite-bundled)
- **Vite** — Dev server + bundler for renderer
- **Express** — HTTP server for API + overlay serving
- **WebSocket (ws)** — Real-time overlay updates
- **SQLite (better-sqlite3)** — Local database
- **tmi.js** — Twitch chat integration

## Running

```bash
npm run dev        # Starts Vite dev server + Electron with nodemon auto-reload
npm run typecheck  # Type check without emit
npm test           # Vitest, single run (see Testing below)
npm run test:watch # Vitest in watch mode
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # Production build + electron-builder
```

## Project Structure

```
src/
  main/          — Electron main process (entry: main.ts)
  server/        — Express backend (entry: index.ts)
    db/          — SQLite setup + schema (schema.ts)
  renderer/      — React UI (Vite dev on :5173)
  overlays/      — Browser source overlays served via Express
  shared/        — Shared types (types.ts) used across all layers
data/
  stream.db      — SQLite database (gitignored, created at runtime)
```

## Key Files

- `src/main/main.ts` — Electron entry point, creates BrowserWindow + starts server
- `src/server/index.ts` — Express server, API routes, WebSocket setup
- `src/server/db/schema.ts` — Database schema definitions
- `src/shared/types.ts` — Shared TypeScript types across main/server/renderer

## Ports

| Port | Service |
|------|---------|
| 4000 | Express server (API + overlays) |
| 5173 | Vite dev server (renderer) |

**Do NOT use ports 3001 or 3336** — occupied by other projects on this machine.

## Security

- API auth token generated per session
- OAuth tokens stored via Electron `safeStorage`
- CORS restricted to known origins
- CSP headers on all responses

## Overlays

Browser source overlays are served at `http://localhost:4000/overlay/*` — add as Browser Source in OBS/Streamlabs.

## Database

SQLite via better-sqlite3. DB file lives at `data/stream.db`. Schema is defined in `src/server/db/schema.ts`. Migrations run on server startup.

## Testing

Tests run at **one seam: the HTTP API**. A test calls `initDatabase(':memory:')`, then
`createApp()` from `src/server/index.ts`, then drives real routes with supertest. No
mocks, no port bound, nothing external contacted. `src/server/__tests__/http-seam.test.ts`
is the reference — copy its shape.

Assert on what a caller observes over HTTP: status codes and response bodies. Never
assert on internal function calls, and never verify by querying the database directly.

Do not add a second seam without agreeing it first. Renderer components and Electron
main are deliberately untested — they are verified by using the app.

`createApp()` must stay free of connections. Anything that binds a socket or talks to
Twitch, OBS, or SMTC belongs in `startServer()`.

**Why `npm test` runs through Electron:** `better-sqlite3` is a native module compiled
against Electron's ABI. Running Vitest under plain Node fails with a
`NODE_MODULE_VERSION` mismatch. The test script therefore runs Vitest inside Electron
via `ELECTRON_RUN_AS_NODE=1`, which is a pure Node process — no window, no port. Do not
"fix" this with `npm rebuild`; that would break the app.

## Conventions

- Code is written in **English**
- User communicates in **German**
- Keep commits and PR descriptions in English
- Domain vocabulary lives in `CONTEXT.md` at the repo root — use those terms in code,
  test names, and issue titles instead of drifting to synonyms

## IMPORTANT: Do NOT start processes

- **NEVER** run `npm run dev`, `npm run build`, `npm start`, or any command that starts a server or builds the app
- **NEVER** run commands that bind to ports (4000, 5173, etc.)
- The user manages the dev server and builds separately
- Use `npm run typecheck`, `npm run lint`, and `npm test` for verification — all three
  terminate on their own and bind no ports

## Active work

Open work lives in **GitHub Issues** (`gh issue list`) — that is the single source of
truth, available on any machine without a `git pull`. Per-machine memory under
`~/.claude/projects/.../memory/` may be out of sync and never overrides an issue.

Historical specs and plans from the previous Superpowers-based workflow sit in
`docs/archive/`. They record what was built and why. They are **not** current process
and should not be used as templates for new work.
