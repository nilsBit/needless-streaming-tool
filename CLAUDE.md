# Stream Toolkit — "The Lab"

Electron Desktop App for Twitch GameDev streaming. Manages overlays, chat commands, stream data, and tooling for the "The Lab" stream brand.

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

## Conventions

- Code is written in **English**
- User communicates in **German**
- Keep commits and PR descriptions in English
