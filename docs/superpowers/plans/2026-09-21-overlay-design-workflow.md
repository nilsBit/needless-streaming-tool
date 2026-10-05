# Overlay-Design-Workflow (Figma hin und zurück) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle zwölf Overlays lassen sich in jedem Zustand ohne Server ansehen, als bearbeitbare Frames nach Figma bringen und als fertige Entwürfe aus Figma zurück ins Repo schicken.

**Architecture:** `boot.js` bekommt einen Showcase-Modus (`?state=`), der WebSocket und `/public/*` aus `src/overlays/showcase/states.json` bedient und die Seite danach einfriert. Ein Playwright-Skript liest daraus einen Knotenbaum je Zustand nach `design/captured/`. Ein lokales Figma-Entwicklungs-Plugin baut daraus Frames und Variablen und schickt fertige Frames an `POST /api/design/inbox`, das nach `design/drafts/` schreibt.

**Tech Stack:** Vanilla JS (Overlays, boot.js), Express + TypeScript (Server), vitest + supertest (Tests, laufen in Electron), playwright-core mit lokalem Chrome (Skripte), Figma Plugin API + esbuild (Plugin).

**Spec:** `docs/superpowers/specs/2026-09-21-overlay-design-workflow-design.md` (inkl. „Nachtrag beim Planen")

## Global Constraints

- Code, Kommentare, Commits auf **Englisch** (`CLAUDE.md`); Plugin-Oberfläche und Doku für den Nutzer auf Deutsch.
- Tests nur an **einer Naht: HTTP-API** mit supertest gegen `createApp()` — Vorbild `src/server/__tests__/http-seam.test.ts`. Keine Mocks, kein Port, keine DB-Abfragen in Assertions.
- `npm test` läuft durch Electron (`ELECTRON_RUN_AS_NODE=1`) — **nicht** `npm rebuild` anfassen.
- `createApp()` bleibt frei von Verbindungen.
- Vor jedem Commit einzeln, Exit-Code je Befehl prüfen: `npm run typecheck`, `npm test`, `npm run lint`.
- **Dev-Server nicht starten, wenn 4000 oder 5173 belegt sind**; nie laufende Prozesse beenden. Mehrere Dateiänderungen in einer Runde (nodemon startet bei jedem Speichern unter `src/server`/`src/main` neu).
- `npm run build*` / `electron-builder` nicht aufrufen.
- Nichts in diesem Vorhaben darf etwas an OBS/den Stream senden: keine `broadcast()`-Aufrufe, keine `/api/actions/overlay-test`.
- Commits lokal; **Push nur nach Rückfrage beim Nutzer**.
- Chrome liegt unter `C:/Program Files/Google/Chrome/Application/chrome.exe` (überschreibbar mit `CHROME_PATH`).
- Namen: `showcase`, `?state=`, `states.json`, `design/captured/`, `design/drafts/<overlay>/<state>/{draft.json,image.png,image@2x.png}`, `design/compare/`, `/api/design/inbox`, `npm run showcase:capture`, `npm run showcase:compare`.

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/overlays/showcase/states.json` | **Neu.** Zustandsliste: je Overlay Größe und Zustände (Ereignisse, `/public`-Antworten, Einfrierzeit). |
| `src/overlays/showcase/portrait.svg` | **Neu.** Testbild für die Eintragskarte. |
| `src/overlays/showcase/index.html` | **Neu.** Die Showcase-Seite (iframes je Zustand). |
| `src/overlays/boot.js` | **Ändern.** Showcase-Modus. |
| `src/server/showcase.ts` | **Neu.** Liest `states.json`, prüft Overlay/Zustand, Pfad zum Design-Ordner. |
| `src/server/api/design.ts` | **Neu.** `GET /captures`, `GET /captures/:overlay/:state`, `POST /inbox`. |
| `src/server/index.ts` | **Ändern.** CORS für Origin `null` unter `/api/design`, eigenes JSON-Limit, Router einhängen. |
| `src/server/__tests__/showcase.test.ts` | **Neu.** HTTP-Tests für Zustandsliste und Showcase-Seite. |
| `src/server/__tests__/design.test.ts` | **Neu.** HTTP-Tests für Erfassungen und Eingang. |
| `scripts/showcase-browser.mjs` | **Neu.** Gemeinsam: Chrome starten, Zustand öffnen und abwarten. |
| `scripts/showcase-capture.mjs` | **Neu.** Erfassung → `design/captured/`. |
| `scripts/capture-dom.js` | **Neu.** Läuft im Browser: DOM → Knotenbaum. |
| `scripts/showcase-compare.mjs` | **Neu.** Entwurf vs. Overlay → `design/compare/`. |
| `figma-plugin/*` | **Neu.** manifest, package.json, tsconfig, `src/code.ts`, `src/import.ts`, `src/export.ts`, `src/ui.html`, `build.mjs`. |
| `.gitignore` | **Ändern.** `design/captured/`, `design/compare/`, `figma-plugin/node_modules/`, `figma-plugin/dist/`. |
| `package.json` | **Ändern.** Skripte, `playwright-core` als devDependency. |
| `docs/design-workflow.md` | **Neu.** Anleitung für den Nutzer. |
| `docs/overlay-variablen.md` | **Löschen** (ersetzt durch `states.json` + Anleitung). |

---

### Task 1: Zustandsliste und Showcase-Modus in boot.js

**Files:**
- Create: `src/overlays/showcase/states.json`, `src/overlays/showcase/portrait.svg`
- Create: `src/server/showcase.ts`
- Modify: `src/overlays/boot.js` (Showcase-Block am Ende der IIFE, vor `})();`)
- Test: `src/server/__tests__/showcase.test.ts`

**Interfaces:**
- Produces `states.json`:
  ```ts
  type States = { overlays: Record<string, {
    size: { width: number; height: number };
    states: Record<string, {
      events?: { afterMs: number; event: string; data: unknown }[];
      public?: Record<string, unknown>;   // key = pathname, e.g. "/public/entry"
      freezeAfterMs: number;              // from socket open
    }>;
  }> };
  ```
- Produces `src/server/showcase.ts`:
  ```ts
  export function overlaysDir(): string;                 // path.join(process.cwd(), 'src', 'overlays')
  export function readStates(): States;                  // parses states.json fresh on each call
  export function isKnownState(overlay: string, state: string): boolean;
  export function designDir(): string;                   // process.env.NST_DESIGN_DIR ?? path.join(process.cwd(), 'design')
  ```
- Produces in the browser: `?state=<name>` on any overlay URL → `<html data-showcase-ready>` once frozen, `<html data-showcase-error="…">` on failure.

- [ ] **Step 1: Test schreiben** — `src/server/__tests__/showcase.test.ts`

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * The showcase plays every overlay state in the browser, without the server.
 * These tests hold the state list to the overlays that actually exist.
 */
describe('showcase state list', () => {
  let app: Express;

  beforeAll(() => {
    initDatabase(':memory:');
    generateApiToken();
    app = createApp();
  });

  const overlayDirs = fs
    .readdirSync(path.join(process.cwd(), 'src', 'overlays'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'showcase')
    .map((d) => d.name);

  it('is served to overlays without a token', async () => {
    const res = await request(app).get('/overlay/showcase/states.json').expect(200);
    expect(res.body.overlays).toBeTypeOf('object');
  });

  it('has at least one state with a size for every overlay', async () => {
    const res = await request(app).get('/overlay/showcase/states.json').expect(200);
    for (const name of overlayDirs) {
      const entry = res.body.overlays[name];
      expect(entry, `missing overlay ${name}`).toBeDefined();
      expect(entry.size.width).toBeGreaterThan(0);
      expect(entry.size.height).toBeGreaterThan(0);
      expect(Object.keys(entry.states).length, `no states for ${name}`).toBeGreaterThan(0);
      for (const [stateName, state] of Object.entries<{ freezeAfterMs: number }>(entry.states)) {
        expect(stateName).toMatch(/^[a-z0-9-]+$/);
        expect(state.freezeAfterMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('lists no overlay that does not exist', async () => {
    const res = await request(app).get('/overlay/showcase/states.json').expect(200);
    for (const name of Object.keys(res.body.overlays)) expect(overlayDirs).toContain(name);
  });

  it('ships boot.js with the showcase mode', async () => {
    const res = await request(app).get('/overlay/boot.js').expect(200);
    expect(res.text).toContain('data-showcase-ready');
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss scheitern**

Run: `npm test -- src/server/__tests__/showcase.test.ts`
Expected: FAIL — 404 für `/overlay/showcase/states.json`.

- [ ] **Step 3: `states.json` anlegen** — `src/overlays/showcase/states.json`

Größen: `character` 568×497 und `song` 350×110 und die Vollbild-Overlays 1920×1080 stammen aus der OBS-Szene „clip studio paint"; `challenge` 800×200, `roulette` 400×500, `poll` 300×400 aus der alten `overlay-variablen.md`; `progress`/`todos` 420×600, `song-queue` 400×300, `reward-leaderboard` 700×260 sind Startwerte. **Läuft OBS** (Port 4455, ohne Passwort), die Größen mit diesem Einzeiler gegenprüfen und in der JSON angleichen:
`node -e "const {OBSWebSocket}=require('obs-websocket-js');const o=new OBSWebSocket();o.connect('ws://127.0.0.1:4455').then(async()=>{for(const i of (await o.call('GetInputList',{inputKind:'browser_source'})).inputs){const s=(await o.call('GetInputSettings',{inputName:i.inputName})).inputSettings;console.log(i.inputName,s.width+'x'+s.height,s.url)}process.exit(0)})"`

```json
{
  "overlays": {
    "alerts": {
      "size": { "width": 1920, "height": 1080 },
      "states": {
        "reward-roulette": { "events": [{ "afterMs": 0, "event": "reward-redeemed", "data": { "reward_type": "roulette", "user_name": "Lesezeichen42" } }], "freezeAfterMs": 900 },
        "reward-feature": { "events": [{ "afterMs": 0, "event": "reward-redeemed", "data": { "reward_type": "feature_request", "user_name": "Kartograph" } }], "freezeAfterMs": 900 },
        "roulette-result": { "events": [{ "afterMs": 0, "event": "roulette-result", "data": { "title": "Die Karte der Unterstadt zeichnen" } }], "freezeAfterMs": 900 }
      }
    },
    "challenge": {
      "size": { "width": 800, "height": 200 },
      "states": {
        "running": {
          "public": { "/public/stream-state": { "challenge_title": "Das Siegel der Zunft entwerfen", "challenge_status": "in_progress", "timer_seconds": 3723, "timer_running": 1, "is_live": 1 } },
          "events": [{ "afterMs": 0, "event": "stream-state", "data": { "challenge_title": "Das Siegel der Zunft entwerfen", "challenge_status": "in_progress", "timer_seconds": 3723, "timer_running": true, "is_live": true } }],
          "freezeAfterMs": 900
        },
        "none": {
          "public": { "/public/stream-state": { "challenge_title": null, "challenge_status": null, "timer_seconds": 0, "timer_running": 0, "is_live": 1 } },
          "freezeAfterMs": 900
        }
      }
    },
    "character": {
      "size": { "width": 568, "height": 497 },
      "states": {
        "with-portrait": {
          "public": { "/public/entry": { "card": { "id": "showcase-1", "title": "Aldric", "art": "Figur", "artColor": "#6f8fb0", "maturity": "Kanon", "alias": "Sturmklinge", "role": "Protagonist", "aliasLine": "genannt Sturmklinge · Protagonist", "body": "Ein Wanderer ohne Erinnerung, der eine Klinge trägt, die ihn besser kennt als er sich selbst.", "facts": [{ "name": "Stärken", "value": "Zäh, geduldig" }, { "name": "Schwächen", "value": "Vergisst, wem er vertraut hat" }], "relations": [{ "name": "gehört zu", "value": "Der Orden der Klinge" }], "image": "/overlay/showcase/portrait.svg", "world": "Die Verborgene Stadt" } } },
          "freezeAfterMs": 1200
        },
        "without-portrait": {
          "public": { "/public/entry": { "card": { "id": "showcase-2", "title": "Die Goldene Hand", "art": "Gilde", "artColor": "#b07a6f", "maturity": "Entwurf", "alias": null, "role": null, "aliasLine": "", "body": "Eine Gilde von Händlern, die jede Münze der Stadt zweimal zählt.", "facts": [{ "name": "Sitz", "value": "Am Alten Markt" }], "relations": [], "image": null, "world": "Die Verborgene Stadt" } } },
          "freezeAfterMs": 1200
        },
        "long-text": {
          "public": { "/public/entry": { "card": { "id": "showcase-3", "title": "Der Zirkel des Wissens", "art": "Gilde", "artColor": "#b07a6f", "maturity": "Idee", "alias": "Die Stillen", "role": "Hüter", "aliasLine": "genannt Die Stillen · Hüter", "body": "Ein Kreis von Gelehrten, der jedes Buch der Stadt katalogisiert, bevor es gelesen werden darf. Wer ein Buch ohne ihren Stempel besitzt, verliert es — und manchmal mehr. Niemand weiß, wie viele Mitglieder der Zirkel hat, und wer fragt, wird selten ein zweites Mal gesehen. In den Kellern unter der Bibliothek sollen Bände lagern, die älter sind als die Stadt selbst.", "facts": [{ "name": "Gegründet", "value": "Vor dem Großen Brand" }, { "name": "Zeichen", "value": "Ein Auge über einem geschlossenen Buch" }, { "name": "Feinde", "value": "Die Schar der Sucher" }], "relations": [{ "name": "wacht über", "value": "Die Arche" }, { "name": "verfeindet mit", "value": "Die Schar der Sucher" }], "image": "/overlay/showcase/portrait.svg", "world": "Die Verborgene Stadt" } } },
          "freezeAfterMs": 1200
        }
      }
    },
    "milestone": {
      "size": { "width": 1920, "height": 1080 },
      "states": {
        "minor": { "events": [{ "afterMs": 0, "event": "milestone-trigger", "data": { "level": "minor", "title": "Erste Figur im Kanon", "message": "Aldric ist offiziell Teil der Welt." } }], "freezeAfterMs": 1400 },
        "major": { "events": [{ "afterMs": 0, "event": "milestone-trigger", "data": { "level": "major", "title": "Zehn Einträge", "message": "Die Verborgene Stadt wächst." } }], "freezeAfterMs": 1400 },
        "epic": { "events": [{ "afterMs": 0, "event": "milestone-trigger", "data": { "level": "epic", "title": "Die Karte ist fertig", "message": "Jede Gasse hat einen Namen." } }], "freezeAfterMs": 1400 }
      }
    },
    "poll": {
      "size": { "width": 300, "height": 400 },
      "states": {
        "open": { "events": [{ "afterMs": 0, "event": "poll-update", "data": { "title": "Wohin geht Aldric?", "options": [{ "label": "Zur Arche", "votes": 12 }, { "label": "In die Unterstadt", "votes": 8 }, { "label": "Zum Zirkel", "votes": 15 }] } }], "freezeAfterMs": 900 },
        "closed": { "events": [{ "afterMs": 0, "event": "poll-update", "data": { "title": "Wohin geht Aldric?", "options": [{ "label": "Zur Arche", "votes": 12 }, { "label": "In die Unterstadt", "votes": 8 }, { "label": "Zum Zirkel", "votes": 15 }] } }, { "afterMs": 300, "event": "poll-close", "data": {} }], "freezeAfterMs": 1200 }
      }
    },
    "progress": {
      "size": { "width": 420, "height": 600 },
      "states": {
        "in-progress": {
          "public": { "/public/progress": { "project_name": "Kapitel 3: Die Unterstadt", "items": [
            { "id": 1, "title": "Karte der Unterstadt", "status": "in_progress", "sort_order": 0, "time_spent": 2700, "todos": [{ "id": 11, "title": "Kanäle einzeichnen", "done": 1, "sort_order": 0, "parent_id": 1 }, { "id": 12, "title": "Märkte benennen", "done": 0, "sort_order": 1, "parent_id": 1 }] },
            { "id": 2, "title": "Die Goldene Hand ausarbeiten", "status": "pending", "sort_order": 1, "time_spent": 0, "todos": [] },
            { "id": 3, "title": "Aldrics Herkunft", "status": "done", "sort_order": 2, "time_spent": 3600, "todos": [] }
          ] } },
          "events": [{ "afterMs": 0, "event": "stream-state", "data": { "timer_seconds": 5400, "timer_running": true } }],
          "freezeAfterMs": 1000
        },
        "empty": { "public": { "/public/progress": { "project_name": null, "items": [] } }, "freezeAfterMs": 1000 }
      }
    },
    "reward-leaderboard": {
      "size": { "width": 700, "height": 260 },
      "states": {
        "top-three": {
          "public": { "/public/reward-stats/top": { "type": "all", "leaderboard": [{ "rank": 1, "userName": "Lesezeichen42", "count": 42, "previousRank": 1 }, { "rank": 2, "userName": "Kartograph", "count": 38, "previousRank": 2 }, { "rank": 3, "userName": "Tintenfass", "count": 15, "previousRank": null }] } },
          "freezeAfterMs": 1200
        }
      }
    },
    "reward-rankchange": {
      "size": { "width": 1920, "height": 1080 },
      "states": {
        "overtake": {
          "events": [{ "afterMs": 0, "event": "reward-leaderboard-update", "data": { "type": "all", "leaderboard": [{ "rank": 1, "userName": "Kartograph", "count": 43, "previousRank": 2 }, { "rank": 2, "userName": "Lesezeichen42", "count": 42, "previousRank": 1 }, { "rank": 3, "userName": "Tintenfass", "count": 15, "previousRank": null }], "changes": [{ "userName": "Kartograph", "from": 2, "to": 1, "changeType": "up" }, { "userName": "Lesezeichen42", "from": 1, "to": 2, "changeType": "down" }], "entered": [{ "userName": "Tintenfass", "rank": 3 }], "exited": [{ "userName": "Nachtschwärmer", "previousRank": 3 }] } }],
          "freezeAfterMs": 1400
        }
      }
    },
    "roulette": {
      "size": { "width": 400, "height": 500 },
      "states": {
        "waiting": { "public": { "/public/issues": [{ "id": 1, "title": "Karte der Unterstadt", "status": "open" }, { "id": 2, "title": "Wappen der Goldenen Hand", "status": "open" }, { "id": 3, "title": "Aldrics Klinge", "status": "open" }, { "id": 4, "title": "Die Arche von innen", "status": "open" }] }, "freezeAfterMs": 900 },
        "spinning": {
          "public": { "/public/issues": [{ "id": 1, "title": "Karte der Unterstadt", "status": "open" }, { "id": 2, "title": "Wappen der Goldenen Hand", "status": "open" }, { "id": 3, "title": "Aldrics Klinge", "status": "open" }, { "id": 4, "title": "Die Arche von innen", "status": "open" }] },
          "events": [{ "afterMs": 200, "event": "roulette-spin", "data": { "issues": [{ "id": 1, "title": "Karte der Unterstadt" }, { "id": 2, "title": "Wappen der Goldenen Hand" }, { "id": 3, "title": "Aldrics Klinge" }, { "id": 4, "title": "Die Arche von innen" }], "winner_id": 2 } }],
          "freezeAfterMs": 1700
        },
        "winner": {
          "public": { "/public/issues": [{ "id": 1, "title": "Karte der Unterstadt", "status": "open" }, { "id": 2, "title": "Wappen der Goldenen Hand", "status": "open" }, { "id": 3, "title": "Aldrics Klinge", "status": "open" }, { "id": 4, "title": "Die Arche von innen", "status": "open" }] },
          "events": [{ "afterMs": 200, "event": "roulette-spin", "data": { "issues": [{ "id": 1, "title": "Karte der Unterstadt" }, { "id": 2, "title": "Wappen der Goldenen Hand" }, { "id": 3, "title": "Aldrics Klinge" }, { "id": 4, "title": "Die Arche von innen" }], "winner_id": 2 } }],
          "freezeAfterMs": 6000
        }
      }
    },
    "song": {
      "size": { "width": 350, "height": 110 },
      "states": {
        "playing": { "public": { "/public/song": { "song": { "title": "Ashes of the Old City", "artist": "Lorewalker", "source": "spotify" } } }, "freezeAfterMs": 1000 }
      }
    },
    "song-queue": {
      "size": { "width": 400, "height": 300 },
      "states": {
        "queue": { "public": { "/public/song-queue": [
          { "id": 1, "url": "https://www.youtube.com/watch?v=a", "title": "Ashes of the Old City", "artist": "Lorewalker", "source": "youtube", "requested_by": "Kartograph", "status": "playing" },
          { "id": 2, "url": "https://www.youtube.com/watch?v=b", "title": "Candlelit Archive", "artist": "Quill & Ember", "source": "youtube", "requested_by": "Tintenfass", "status": "pending" },
          { "id": 3, "url": "https://open.spotify.com/track/c", "title": "Under the Guildhall", "artist": "Mapmaker", "source": "spotify", "requested_by": "Lesezeichen42", "status": "pending" }
        ] }, "freezeAfterMs": 1000 },
        "empty": { "public": { "/public/song-queue": [] }, "freezeAfterMs": 1000 }
      }
    },
    "todos": {
      "size": { "width": 420, "height": 600 },
      "states": {
        "open-todos": {
          "public": { "/public/progress": { "project_name": "Kapitel 3: Die Unterstadt", "items": [
            { "id": 1, "title": "Karte der Unterstadt", "status": "in_progress", "sort_order": 0, "time_spent": 2700, "todos": [{ "id": 11, "title": "Kanäle einzeichnen", "done": 1, "sort_order": 0, "parent_id": 1 }, { "id": 12, "title": "Märkte benennen", "done": 0, "sort_order": 1, "parent_id": 1 }, { "id": 13, "title": "Stadttore setzen", "done": 0, "sort_order": 2, "parent_id": 1 }] }
          ] } },
          "freezeAfterMs": 1000
        },
        "empty": { "public": { "/public/progress": { "project_name": null, "items": [] } }, "freezeAfterMs": 1000 }
      }
    }
  }
}
```

- [ ] **Step 4: Testbild** — `src/overlays/showcase/portrait.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" fill="#3a3226"/>
  <circle cx="120" cy="92" r="46" fill="#8a7a5c"/>
  <path d="M40 240c8-58 44-88 80-88s72 30 80 88z" fill="#8a7a5c"/>
</svg>
```

- [ ] **Step 5: Showcase-Modus in `boot.js`** — unmittelbar vor der letzten Zeile `})();` einfügen:

```js
  /*
   * Showcase mode: `?state=<name>` plays one state from
   * /overlay/showcase/states.json instead of listening to the server. Nothing
   * reaches OBS and nothing reads the database. Once the state has played, the
   * page is frozen — animations paused, timers cleared — and
   * `data-showcase-ready` marks it for the capture script.
   */
  var showcaseState = new URLSearchParams(window.location.search).get('state');
  if (showcaseState) installShowcase(name, showcaseState);

  function installShowcase(overlay, stateName) {
    var root = document.documentElement;
    var realFetch = window.fetch.bind(window);
    var realSetTimeout = window.setTimeout.bind(window);
    var realSetInterval = window.setInterval.bind(window);
    var realRaf = window.requestAnimationFrame.bind(window);
    var timeouts = [];
    var intervals = [];
    var frames = [];
    var frozen = false;

    function fail(message) {
      root.setAttribute('data-showcase-error', message);
    }

    var statePromise = realFetch(origin + '/overlay/showcase/states.json')
      .then(function (r) {
        return r.json();
      })
      .then(function (all) {
        var entry = all.overlays[overlay];
        var state = entry && entry.states[stateName];
        if (!state) throw new Error('unknown state ' + overlay + ' / ' + stateName);
        return state;
      });
    statePromise.catch(function (e) {
      fail(String(e && e.message ? e.message : e));
    });

    // Timers the overlay starts are tracked so the freeze can stop them —
    // otherwise an alert would hide itself or a clock keep ticking mid-capture.
    window.setTimeout = function () {
      if (frozen) return 0;
      var id = realSetTimeout.apply(window, arguments);
      timeouts.push(id);
      return id;
    };
    window.setInterval = function () {
      if (frozen) return 0;
      var id = realSetInterval.apply(window, arguments);
      intervals.push(id);
      return id;
    };
    window.requestAnimationFrame = function (cb) {
      if (frozen) return 0;
      var id = realRaf(cb);
      frames.push(id);
      return id;
    };

    // The overlay config stays real so palette changes show up here too.
    window.fetch = function (input, init) {
      var url = new URL(typeof input === 'string' ? input : input.url, origin);
      if (url.pathname.indexOf('/public/') !== 0 || url.pathname === '/public/overlay-config') {
        return realFetch(input, init);
      }
      return statePromise.then(function (state) {
        var body = (state.public || {})[url.pathname];
        var json = { 'Content-Type': 'application/json' };
        if (body === undefined) return new Response('null', { status: 404, headers: json });
        return new Response(JSON.stringify(body), { status: 200, headers: json });
      });
    };

    function freeze() {
      if (frozen) return;
      document.getAnimations().forEach(function (a) {
        a.pause();
      });
      frozen = true;
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      frames.forEach(cancelAnimationFrame);
      document.fonts.ready.then(function () {
        root.setAttribute('data-showcase-ready', '');
      });
    }

    function FakeSocket() {
      var socket = this;
      socket.readyState = 0;
      realSetTimeout(function () {
        socket.readyState = 1;
        if (socket.onopen) socket.onopen({});
        statePromise.then(function (state) {
          (state.events || []).forEach(function (e) {
            realSetTimeout(function () {
              if (!frozen && socket.onmessage) {
                socket.onmessage({ data: JSON.stringify({ event: e.event, data: e.data }) });
              }
            }, e.afterMs || 0);
          });
          realSetTimeout(freeze, state.freezeAfterMs || 0);
        });
      }, 0);
    }
    FakeSocket.prototype.send = function () {};
    FakeSocket.prototype.close = function () {};
    FakeSocket.prototype.addEventListener = function (type, fn) {
      this['on' + type] = fn;
    };
    FakeSocket.CONNECTING = 0;
    FakeSocket.OPEN = 1;
    FakeSocket.CLOSING = 2;
    FakeSocket.CLOSED = 3;
    window.WebSocket = FakeSocket;
  }
```

- [ ] **Step 6: `src/server/showcase.ts`**

```ts
import fs from 'fs';
import path from 'path';

export interface ShowcaseState {
  events?: { afterMs: number; event: string; data: unknown }[];
  public?: Record<string, unknown>;
  freezeAfterMs: number;
}

export interface ShowcaseStates {
  overlays: Record<string, { size: { width: number; height: number }; states: Record<string, ShowcaseState> }>;
}

export function overlaysDir(): string {
  return path.join(process.cwd(), 'src', 'overlays');
}

/** Read fresh each time — the file is edited while the tool runs. */
export function readStates(): ShowcaseStates {
  return JSON.parse(fs.readFileSync(path.join(overlaysDir(), 'showcase', 'states.json'), 'utf8'));
}

/** The only way a name from a request may become part of a path. */
export function isKnownState(overlay: string, state: string): boolean {
  const entry = readStates().overlays[overlay];
  return entry !== undefined && Object.prototype.hasOwnProperty.call(entry.states, state);
}

/** Where captures and drafts live. Tests point it at a temp dir. */
export function designDir(): string {
  return process.env.NST_DESIGN_DIR ?? path.join(process.cwd(), 'design');
}
```

- [ ] **Step 7: Tests laufen lassen**

Run: `npm test -- src/server/__tests__/showcase.test.ts`
Expected: PASS (4 Tests). `/overlay/showcase/states.json` kommt über das bestehende `express.static(builtinOverlayPath)`.

- [ ] **Step 8: Typecheck, alle Tests, Lint** — je einzeln: `npm run typecheck`, `npm test`, `npm run lint`. Alle Exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/overlays/showcase/states.json src/overlays/showcase/portrait.svg src/overlays/boot.js src/server/showcase.ts src/server/__tests__/showcase.test.ts
git commit -m "feat(overlays): play any overlay state without the server via ?state="
```

---

### Task 2: Die Showcase-Seite

**Files:**
- Create: `src/overlays/showcase/index.html`
- Test: `src/server/__tests__/showcase.test.ts` (ergänzen)

**Interfaces:**
- Consumes: `states.json` aus Task 1, `?state=` aus Task 1.
- Produces: `http://localhost:4000/overlay/showcase/` — Seite für Menschen, keine Schnittstelle.

- [ ] **Step 1: Test ergänzen** (in den bestehenden `describe` von `showcase.test.ts`):

```ts
  it('serves the showcase page', async () => {
    const res = await request(app).get('/overlay/showcase/').expect(200);
    expect(res.text).toContain('states.json');
    expect(res.text).toContain('?state=');
  });
```

- [ ] **Step 2: Laufen lassen, muss scheitern** — `npm test -- src/server/__tests__/showcase.test.ts` → FAIL 404.

- [ ] **Step 3: Seite anlegen** — `src/overlays/showcase/index.html`

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>NST Showcase</title>
  <style>
    body { margin: 0; padding: 24px; background: #1b1916; color: #e1d6c2; font: 14px/1.4 system-ui, sans-serif; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p.hint { margin: 0 0 24px; color: #9b9484; }
    section { margin-bottom: 40px; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    .states { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
    figure { margin: 0; }
    figcaption { margin-top: 6px; color: #9b9484; font-size: 12px; }
    figcaption a { color: inherit; }
    /* A checkerboard shows what OBS will lay over the video. */
    .stage {
      position: relative; overflow: hidden; outline: 1px solid #3a372f;
      background: repeating-conic-gradient(#2a2723 0 25%, #221f1b 0 50%) 0 0 / 20px 20px;
    }
    .stage iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; background: transparent; }
  </style>
</head>
<body>
  <h1>Showcase</h1>
  <p class="hint">Jedes Overlay in jedem Zustand, mit Testdaten. Nichts hiervon erreicht OBS.</p>
  <main id="list"></main>
  <script>
    // Anything wider than this is shown scaled down; the caption says by how much.
    const MAX_WIDTH = 760;

    fetch('/overlay/showcase/states.json')
      .then((r) => r.json())
      .then(({ overlays }) => {
        const list = document.getElementById('list');
        for (const [name, entry] of Object.entries(overlays)) {
          const section = document.createElement('section');
          section.innerHTML = `<h2>${name} <small>${entry.size.width}×${entry.size.height}</small></h2>`;
          const states = document.createElement('div');
          states.className = 'states';
          for (const state of Object.keys(entry.states)) {
            const scale = Math.min(1, MAX_WIDTH / entry.size.width);
            const src = `/overlay/${name}/index.html?state=${encodeURIComponent(state)}`;
            const figure = document.createElement('figure');
            figure.innerHTML = `
              <div class="stage" style="width:${entry.size.width * scale}px;height:${entry.size.height * scale}px">
                <iframe src="${src}" width="${entry.size.width}" height="${entry.size.height}"
                  style="transform:scale(${scale})" title="${name} / ${state}"></iframe>
              </div>
              <figcaption><a href="${src}" target="_blank">${name} / ${state}</a>${scale < 1 ? ` · ${Math.round(scale * 100)} %` : ''}</figcaption>`;
            states.appendChild(figure);
          }
          section.appendChild(states);
          list.appendChild(section);
        }
      });
  </script>
</body>
</html>
```

- [ ] **Step 4: Tests** — `npm test -- src/server/__tests__/showcase.test.ts` → PASS (5).

- [ ] **Step 5: Ansehen ohne Fenster.** Läuft das Tool (Port 4000 belegt), die Seite headless rendern und das Bild ansehen:

```bash
node -e "const {chromium}=require('playwright-core');(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const p=await b.newPage({viewport:{width:1600,height:1200}});await p.goto('http://localhost:4000/overlay/showcase/');await p.waitForTimeout(8000);await p.screenshot({path:'showcase.png',fullPage:true});await b.close()})()"
```

(`playwright-core` wird in Task 3 installiert; bis dahin aus `D:/dev/worldbuilder/node_modules/playwright-core` mit `require('D:/dev/worldbuilder/node_modules/playwright-core')`.) Jeder Zustand muss sichtbar gefüllt sein. Läuft das Tool nicht: Schritt überspringen und im Bericht sagen, dass die Seite nur per Test geprüft ist.

- [ ] **Step 6: typecheck / test / lint einzeln, Commit**

```bash
git add src/overlays/showcase/index.html src/server/__tests__/showcase.test.ts
git commit -m "feat(overlays): showcase page with every overlay state side by side"
```

---

### Task 3: Erfassen (`npm run showcase:capture`)

**Files:**
- Create: `scripts/showcase-browser.mjs`, `scripts/capture-dom.js`, `scripts/showcase-capture.mjs`
- Modify: `package.json` (Skript `showcase:capture`, devDependency `playwright-core`), `.gitignore`

**Interfaces:**
- Consumes: `?state=`, `data-showcase-ready`, `data-showcase-error` aus Task 1; `GET /public/overlay-config`.
- Produces `scripts/showcase-browser.mjs`:
  ```js
  export const BASE; // 'http://localhost:4000'
  export async function requireRunningTool(): Promise<void>;   // exits 1 with a German message if 4000 is down
  export async function launch(): Promise<import('playwright-core').Browser>;
  export async function openState(browser, overlay, state, size): Promise<{ page, errors: string[] }>; // waits for data-showcase-ready, throws on data-showcase-error or 15 s timeout
  export async function readStates(): Promise<ShowcaseStates>;  // GET /overlay/showcase/states.json
  ```
- Produces `design/captured/<overlay>/<state>.json`:
  ```ts
  type Color = { hex: string; alpha: number; token?: string };
  type Node = {
    kind: 'box' | 'text' | 'image' | 'svg';
    name: string;                        // tag.class, e.g. "div.card"
    x: number; y: number; width: number; height: number;   // relative to parent node
    opacity: number;
    fill?: Color;
    borders?: { top: Border; right: Border; bottom: Border; left: Border };   // Border = { width: number; color: Color }
    radii?: [number, number, number, number];               // tl, tr, br, bl
    shadow?: { x: number; y: number; blur: number; spread: number; color: Color };
    text?: { content: string; family: string; size: number; weight: number; italic: boolean; color: Color;
             lineHeight: number; letterSpacing: number; align: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' };
    image?: { dataUrl: string };         // PNG as data URL
    svg?: { source: string };
    children?: Node[];
  };
  type Capture = { overlay: string; state: string; width: number; height: number;
                   tokens: Record<string, string>; preview: string /* PNG data URL */; nodes: Node[] };
  ```

- [ ] **Step 1: Abhängigkeit und Ignore**

```bash
npm install --save-dev playwright-core
```

`.gitignore` ergänzen:
```
design/captured/
design/compare/
figma-plugin/node_modules/
figma-plugin/dist/
```

`package.json` → `scripts`:
```json
"showcase:capture": "node scripts/showcase-capture.mjs",
```

- [ ] **Step 2: `scripts/showcase-browser.mjs`**

```js
import { chromium } from 'playwright-core';

export const BASE = 'http://localhost:4000';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export async function requireRunningTool() {
  try {
    const res = await fetch(`${BASE}/public/overlay-config`);
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    console.error('Das Stream Tool läuft nicht (Port 4000). Erst `npm run dev` starten.');
    process.exit(1);
  }
}

export async function launch() {
  return chromium.launch({ executablePath: CHROME, headless: true });
}

export async function readStates() {
  return (await fetch(`${BASE}/overlay/showcase/states.json`)).json();
}

/** Opens one state at its OBS size and waits until boot.js has frozen it. */
export async function openState(browser, overlay, state, size) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/overlay/${overlay}/index.html?state=${encodeURIComponent(state)}`);
  await page.waitForFunction(
    () => document.documentElement.hasAttribute('data-showcase-ready') ||
          document.documentElement.hasAttribute('data-showcase-error'),
    null,
    { timeout: 15_000 },
  );
  const failure = await page.evaluate(() => document.documentElement.getAttribute('data-showcase-error'));
  if (failure !== null) throw new Error(`${overlay} / ${state}: ${failure}`);
  return { page, errors };
}
```

- [ ] **Step 3: `scripts/capture-dom.js`** — wird mit `page.evaluate` im Overlay ausgeführt, bekommt `{ tokens }` und liefert `Node[]`.

```js
/* Runs inside the overlay page. Turns the rendered DOM into the node tree
   the Figma plugin rebuilds. Only what Figma can hold is read. */
(({ tokens }) => {
  const tokenByHex = {};
  for (const [name, value] of Object.entries(tokens)) {
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) tokenByHex[value.toLowerCase()] = name;
  }

  function color(css) {
    const m = css.match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\)/);
    if (!m) return null;
    const hex = '#' + [m[1], m[2], m[3]].map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('');
    let alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
    const out = { hex, alpha };
    if (tokenByHex[hex]) out.token = tokenByHex[hex];
    return out;
  }

  function border(style, side) {
    const width = parseFloat(style[`border${side}Width`]) || 0;
    if (width === 0 || style[`border${side}Style`] === 'none') return { width: 0, color: { hex: '#000000', alpha: 0 } };
    return { width, color: color(style[`border${side}Color`]) ?? { hex: '#000000', alpha: 0 } };
  }

  function shadow(css) {
    if (!css || css === 'none') return undefined;
    const c = css.match(/rgba?\([^)]*\)/);
    const nums = css.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(parseFloat);
    if (!c || nums.length < 2) return undefined;
    return { x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, color: color(c[0]) };
  }

  function align(v) {
    return v === 'center' ? 'CENTER' : v === 'right' || v === 'end' ? 'RIGHT' : v === 'justify' ? 'JUSTIFIED' : 'LEFT';
  }

  function imageData(img) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function visible(el, style, rect) {
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && Number(style.opacity) > 0;
  }

  function read(el, origin) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!visible(el, style, rect)) return null;
    const base = {
      name: el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].join('.') : ''),
      x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height,
      opacity: Number(style.opacity),
    };

    if (el.tagName === 'svg') return { kind: 'svg', ...base, svg: { source: el.outerHTML } };
    if (el.tagName === 'IMG') {
      const dataUrl = imageData(el);
      return dataUrl ? { kind: 'image', ...base, image: { dataUrl } } : null;
    }

    const node = { kind: 'box', ...base };
    const fill = color(style.backgroundColor);
    if (fill && fill.alpha > 0) node.fill = fill;
    const borders = { top: border(style, 'Top'), right: border(style, 'Right'), bottom: border(style, 'Bottom'), left: border(style, 'Left') };
    if (Object.values(borders).some((b) => b.width > 0)) node.borders = borders;
    const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map((r) => parseFloat(r) || 0);
    if (radii.some((r) => r > 0)) node.radii = radii;
    const sh = shadow(style.boxShadow);
    if (sh) node.shadow = sh;

    const children = [];
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '') {
        const range = document.createRange();
        range.selectNodeContents(child);
        const r = range.getBoundingClientRect();
        if (r.width === 0) continue;
        const lineHeight = style.lineHeight === 'normal' ? parseFloat(style.fontSize) * 1.2 : parseFloat(style.lineHeight);
        children.push({
          kind: 'text', name: '#text',
          x: r.left - rect.left, y: r.top - rect.top, width: r.width, height: r.height, opacity: 1,
          text: {
            content: child.textContent.replace(/\s+/g, ' ').trim(),
            family: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
            size: parseFloat(style.fontSize), weight: Number(style.fontWeight) || 400,
            italic: style.fontStyle === 'italic', color: color(style.color),
            lineHeight, letterSpacing: parseFloat(style.letterSpacing) || 0, align: align(style.textAlign),
          },
        });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const c = read(child, rect);
        if (c) children.push(c);
      }
    }
    if (children.length) node.children = children;
    // A box with nothing to draw and nothing inside is noise in Figma.
    if (!node.fill && !node.borders && !node.shadow && !node.children) return null;
    return node;
  }

  const bodyRect = document.body.getBoundingClientRect();
  const origin = { left: 0, top: 0, width: bodyRect.width, height: bodyRect.height };
  return [...document.body.children].map((el) => read(el, origin)).filter(Boolean);
});
```

- [ ] **Step 4: `scripts/showcase-capture.mjs`**

```js
import fs from 'fs';
import path from 'path';
import { BASE, launch, openState, readStates, requireRunningTool } from './showcase-browser.mjs';

// Captures every showcase state into design/captured/<overlay>/<state>.json.
// Usage: npm run showcase:capture [-- <overlay>]
await requireRunningTool();
const only = process.argv[2];
const states = await readStates();
const config = await (await fetch(`${BASE}/public/overlay-config`)).json();
const captureDom = fs.readFileSync(new URL('./capture-dom.js', import.meta.url), 'utf8');
const outDir = path.join(process.cwd(), 'design', 'captured');

const browser = await launch();
let failed = 0;
try {
  for (const [overlay, entry] of Object.entries(states.overlays)) {
    if (only && overlay !== only) continue;
    const tokens = { ...(config.global ?? {}), ...(config.overrides?.[overlay] ?? {}) };
    for (const state of Object.keys(entry.states)) {
      try {
        const { page, errors } = await openState(browser, overlay, state, entry.size);
        const nodes = await page.evaluate(`(${captureDom.trim().replace(/;$/, '')})(${JSON.stringify({ tokens })})`);
        const preview = 'data:image/png;base64,' + (await page.screenshot({ omitBackground: true })).toString('base64');
        await page.close();
        if (errors.length) throw new Error('console errors: ' + errors.join(' | '));
        const file = path.join(outDir, overlay, `${state}.json`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const capture = { overlay, state, width: entry.size.width, height: entry.size.height, tokens, preview, nodes };
        fs.writeFileSync(file, JSON.stringify(capture));
        const json = JSON.stringify(nodes);
        const bound = (json.match(/"token":/g) ?? []).length;
        const colors = (json.match(/"hex":/g) ?? []).length;
        console.log(`ok   ${overlay} / ${state} — ${colors} Farben, davon ${bound} an Tokens`);
      } catch (e) {
        failed++;
        console.log(`FAIL ${overlay} / ${state} — ${e.message}`);
      }
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 5: Laufen lassen** (nur wenn Port 4000 belegt ist; sonst den Nutzer bitten, `npm run dev` zu starten — **nicht selbst starten, wenn er gerade streamt**):

Run: `npm run showcase:capture`
Expected: je Zustand eine `ok`-Zeile, Exit 0. Jede `FAIL`-Zeile lesen: Liegt es am Zustand (Einfrierzeit zu kurz → `freezeAfterMs` erhöhen; falsche Daten → an den Code des Overlays angleichen) oder an `boot.js`? Eine Zeile mit `0` Token-Treffern bei einem Overlay, das sichtbar Tokenfarben trägt, ist ein Fehler in `color()` — nicht weitergehen. Drei `preview`-Bilder stichprobenhaft ansehen (data URL in eine PNG-Datei schreiben und mit dem Read-Werkzeug öffnen).

- [ ] **Step 6: typecheck / test / lint einzeln, Commit**

```bash
git add scripts/showcase-browser.mjs scripts/capture-dom.js scripts/showcase-capture.mjs package.json package-lock.json .gitignore src/overlays/showcase/states.json
git commit -m "feat(design): capture every showcase state as a node tree for Figma"
```

---

### Task 4: Server — Erfassungen ausliefern, Entwürfe annehmen

**Files:**
- Create: `src/server/api/design.ts`
- Modify: `src/server/index.ts` (CORS, JSON-Limit, Router)
- Test: `src/server/__tests__/design.test.ts`

**Interfaces:**
- Consumes: `isKnownState`, `designDir` aus `src/server/showcase.ts` (Task 1); Capture-Format aus Task 3.
- Produces (alle hinter dem API-Token):
  - `GET /api/design/states` → `200 ShowcaseStates` (für das Plugin — `/overlay/*` bekommt kein CORS für Origin `null`)
  - `GET /api/design/captures` → `200 [{ overlay: string, state: string }]`
  - `GET /api/design/captures/:overlay/:state` → `200 Capture` | `404`
  - `POST /api/design/inbox` body `{ overlay, state, draft: object, image: string, image2x: string }` (PNG base64 ohne Präfix) → `201 { saved: "design/drafts/<overlay>/<state>" }` | `400 { error }`
  - CORS: Origin `null` erlaubt nur für `/api/design/*`.

- [ ] **Step 1: Test schreiben** — `src/server/__tests__/design.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

// Smallest valid PNG (1×1, transparent).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('design round trip', () => {
  let app: Express;
  let token: string;
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-design-'));
    process.env.NST_DESIGN_DIR = dir;
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterAll(() => {
    delete process.env.NST_DESIGN_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('needs the token', async () => {
    await request(app).get('/api/design/captures').expect(401);
    await request(app).post('/api/design/inbox').send({}).expect(401);
  });

  it('hands the state list to the plugin', async () => {
    const res = await request(app).get('/api/design/states').set(auth()).expect(200);
    expect(res.body.overlays.character.states['with-portrait']).toBeDefined();
  });

  it('lists and serves captures', async () => {
    fs.mkdirSync(path.join(dir, 'captured', 'song'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'captured', 'song', 'playing.json'), JSON.stringify({ overlay: 'song', state: 'playing', nodes: [] }));

    const list = await request(app).get('/api/design/captures').set(auth()).expect(200);
    expect(list.body).toContainEqual({ overlay: 'song', state: 'playing' });

    const one = await request(app).get('/api/design/captures/song/playing').set(auth()).expect(200);
    expect(one.body.overlay).toBe('song');
  });

  it('answers 404 for a known state that was never captured', async () => {
    await request(app).get('/api/design/captures/poll/open').set(auth()).expect(404);
  });

  it('refuses names that are not in the state list', async () => {
    await request(app).get('/api/design/captures/..%2F..%2Fsecret/x').set(auth()).expect(404);
    const res = await request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: '../../evil', state: 'playing', draft: {}, image: PNG, image2x: PNG }).expect(400);
    expect(res.body.error).toMatch(/unknown/i);
  });

  it('saves a draft next to the code', async () => {
    const res = await request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: 'character', state: 'with-portrait', draft: { name: 'character / with-portrait' }, image: PNG, image2x: PNG })
      .expect(201);
    expect(res.body.saved).toBe('design/drafts/character/with-portrait');

    const saved = await request(app).get('/api/design/drafts/character/with-portrait').set(auth()).expect(200);
    expect(saved.body.draft.name).toBe('character / with-portrait');
    expect(saved.body.images).toEqual(['image.png', 'image@2x.png']);
  });

  it('refuses an image that is not a PNG', async () => {
    const res = await request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: 'song', state: 'playing', draft: {}, image: Buffer.from('hello').toString('base64'), image2x: PNG })
      .expect(400);
    expect(res.body.error).toMatch(/png/i);
  });

  it('takes drafts bigger than the global body limit', async () => {
    const big = { padding: 'x'.repeat(500_000) };
    await request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: 'song', state: 'playing', draft: big, image: PNG, image2x: PNG }).expect(201);
  });

  it('lets the Figma plugin (origin null) through CORS only under /api/design', async () => {
    const design = await request(app).get('/api/design/captures').set(auth()).set('Origin', 'null').expect(200);
    expect(design.headers['access-control-allow-origin']).toBe('null');
    const other = await request(app).get('/api/health').set(auth()).set('Origin', 'null');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
```

(Der Test liest den gespeicherten Entwurf über `GET /api/design/drafts/:overlay/:state` zurück statt über das Dateisystem — Assertions nur über HTTP. Diese Route gehört damit zu den Produces: `200 { draft: object, images: string[] }` | `404`.)

- [ ] **Step 2: Laufen lassen, muss scheitern** — `npm test -- src/server/__tests__/design.test.ts` → FAIL (404 statt 200/201).

- [ ] **Step 3: `src/server/api/design.ts`**

```ts
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { designDir, isKnownState, readStates } from '../showcase';

/**
 * The Figma round trip: captures go out to the plugin, finished frames come
 * back as drafts next to the code. Names from a request only become paths
 * after `isKnownState` — nothing is written outside design/drafts/.
 */
const router = Router();

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(base64: unknown): Buffer | null {
  if (typeof base64 !== 'string') return null;
  const bytes = Buffer.from(base64, 'base64');
  return bytes.subarray(0, 8).equals(PNG_SIGNATURE) ? bytes : null;
}

router.get('/states', (_req, res) => {
  res.json(readStates());
});

router.get('/captures', (_req, res) => {
  const found: { overlay: string; state: string }[] = [];
  const { overlays } = readStates();
  for (const [overlay, entry] of Object.entries(overlays)) {
    for (const state of Object.keys(entry.states)) {
      if (fs.existsSync(path.join(designDir(), 'captured', overlay, `${state}.json`))) found.push({ overlay, state });
    }
  }
  res.json(found);
});

router.get('/captures/:overlay/:state', (req, res) => {
  const { overlay, state } = req.params;
  const file = path.join(designDir(), 'captured', overlay, `${state}.json`);
  if (!isKnownState(overlay, state) || !fs.existsSync(file)) { res.status(404).json({ error: 'not captured' }); return; }
  res.type('application/json').send(fs.readFileSync(file, 'utf8'));
});

router.get('/drafts/:overlay/:state', (req, res) => {
  const { overlay, state } = req.params;
  const dir = path.join(designDir(), 'drafts', overlay, state);
  if (!isKnownState(overlay, state) || !fs.existsSync(path.join(dir, 'draft.json'))) { res.status(404).json({ error: 'no draft' }); return; }
  const images = ['image.png', 'image@2x.png'].filter((f) => fs.existsSync(path.join(dir, f)));
  res.json({ draft: JSON.parse(fs.readFileSync(path.join(dir, 'draft.json'), 'utf8')), images });
});

router.post('/inbox', (req, res) => {
  const { overlay, state, draft, image, image2x } = req.body ?? {};
  if (typeof overlay !== 'string' || typeof state !== 'string' || !isKnownState(overlay, state)) {
    res.status(400).json({ error: `unknown overlay/state: ${String(overlay)} / ${String(state)}` });
    return;
  }
  if (typeof draft !== 'object' || draft === null) { res.status(400).json({ error: 'draft must be an object' }); return; }
  const one = png(image);
  const two = png(image2x);
  if (!one || !two) { res.status(400).json({ error: 'image and image2x must be PNG (base64)' }); return; }

  const dir = path.join(designDir(), 'drafts', overlay, state);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify(draft, null, 2));
  fs.writeFileSync(path.join(dir, 'image.png'), one);
  fs.writeFileSync(path.join(dir, 'image@2x.png'), two);
  res.status(201).json({ saved: `design/drafts/${overlay}/${state}` });
});

export default router;
```

- [ ] **Step 4: `src/server/index.ts` anpassen** — in einer Runde (nodemon!):

1. Import oben zu den anderen Routern: `import designRouter from './api/design';`
2. Im CORS-Block die Zeile `const allowed = …` ersetzen durch:

```ts
    // The Figma plugin runs in a sandboxed iframe and sends `Origin: null`.
    // Allowed only where the plugin talks — everything there needs the token.
    const figmaPlugin = origin === 'null' && req.path.startsWith('/api/design/');
    const allowed = figmaPlugin || !origin || origin.startsWith('http://localhost:') || origin.startsWith('file://') ||
      (HOST === '0.0.0.0' && /^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(origin));
```

3. **Vor** `app.use(express.json({ limit: '100kb' }));` einfügen:

```ts
  // Drafts carry two PNGs of a whole overlay; the global limit is for everything else.
  app.use('/api/design/inbox', express.json({ limit: '30mb' }));
```

4. Bei den API-Routen: `app.use('/api/design', designRouter);`

- [ ] **Step 5: Tests** — `npm test -- src/server/__tests__/design.test.ts` → PASS (9). Dann einzeln `npm run typecheck`, `npm test`, `npm run lint` — alle Exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/design.ts src/server/index.ts src/server/__tests__/design.test.ts
git commit -m "feat(design): serve captures to the Figma plugin and take drafts back"
```

---

### Task 5: Figma-Plugin — Einlesen

**Files:**
- Create: `figma-plugin/manifest.json`, `figma-plugin/package.json`, `figma-plugin/tsconfig.json`, `figma-plugin/build.mjs`, `figma-plugin/src/code.ts`, `figma-plugin/src/import.ts`, `figma-plugin/src/ui.html`

**Interfaces:**
- Consumes: `GET /api/design/captures`, `GET /api/design/captures/:overlay/:state` (Task 4), Capture-Format (Task 3).
- Produces (Nachrichten UI ↔ Hauptthread, Task 6 erweitert sie):
  ```ts
  type ToMain =
    | { type: 'import'; captures: Capture[] }
    | { type: 'save-token'; token: string }
    | { type: 'send-selection' };                    // Task 6
  type ToUi =
    | { type: 'token'; token: string }
    | { type: 'log'; text: string }
    | { type: 'drafts'; drafts: Draft[] };           // Task 6
  ```
- Produces `figma-plugin/src/import.ts`:
  ```ts
  export async function ensureVariables(tokens: Record<string, string>): Promise<Map<string, Variable>>;
  export async function importCaptures(captures: Capture[], log: (text: string) => void): Promise<void>;
  ```

- [ ] **Step 1: Gerüst**

`figma-plugin/manifest.json`:
```json
{
  "name": "NST-Brücke",
  "id": "nst-bridge-local",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["none"],
    "devAllowedDomains": ["http://localhost:4000"],
    "reasoning": "Spricht nur mit dem Needless Streaming Tool auf diesem Rechner."
  }
}
```

`figma-plugin/package.json`:
```json
{
  "name": "nst-figma-plugin",
  "private": true,
  "scripts": { "build": "node build.mjs", "typecheck": "tsc --noEmit" },
  "devDependencies": { "@figma/plugin-typings": "^1.100.0", "esbuild": "^0.24.0", "typescript": "^5.6.0" }
}
```

`figma-plugin/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2017", "module": "ESNext", "moduleResolution": "bundler", "strict": true,
    "lib": ["ES2017"], "typeRoots": ["./node_modules/@figma"], "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

`figma-plugin/build.mjs`:
```js
import { build } from 'esbuild';
import fs from 'fs';

await build({ entryPoints: ['src/code.ts'], bundle: true, outfile: 'dist/code.js', target: 'es2017' });
fs.mkdirSync('dist', { recursive: true });
fs.copyFileSync('src/ui.html', 'dist/ui.html');
console.log('figma-plugin gebaut → dist/');
```

Dann: `npm --prefix figma-plugin install` — überholt: siehe docs/design-workflow.md (cd figma-plugin && npm install)

- [ ] **Step 2: `figma-plugin/src/import.ts`**

```ts
export type Color = { hex: string; alpha: number; token?: string };
type Border = { width: number; color: Color };
export type CaptureNode = {
  kind: 'box' | 'text' | 'image' | 'svg';
  name: string; x: number; y: number; width: number; height: number; opacity: number;
  fill?: Color; borders?: { top: Border; right: Border; bottom: Border; left: Border };
  radii?: [number, number, number, number];
  shadow?: { x: number; y: number; blur: number; spread: number; color: Color };
  text?: { content: string; family: string; size: number; weight: number; italic: boolean; color: Color;
           lineHeight: number; letterSpacing: number; align: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' };
  image?: { dataUrl: string }; svg?: { source: string }; children?: CaptureNode[];
};
export type Capture = { overlay: string; state: string; width: number; height: number;
  tokens: Record<string, string>; preview: string; nodes: CaptureNode[] };

const COLLECTION = 'NST';
const FLOAT_TOKENS = ['--color-bg-opacity', '--font-size-base'];
const STRING_TOKENS = ['--font-display', '--font-body'];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** The ten tokens as Figma variables in the collection "NST"; existing ones get the current value. */
export async function ensureVariables(tokens: Record<string, string>): Promise<Map<string, Variable>> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collection = collections.find((c) => c.name === COLLECTION) ?? figma.variables.createVariableCollection(COLLECTION);
  const modeId = collection.modes[0].modeId;
  const existing = new Map<string, Variable>();
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) existing.set(v.name, v);
  }
  for (const [name, value] of Object.entries(tokens)) {
    const type: VariableResolvedDataType = FLOAT_TOKENS.includes(name) ? 'FLOAT' : STRING_TOKENS.includes(name) ? 'STRING' : 'COLOR';
    if (type === 'COLOR' && !/^#[0-9a-f]{6}$/i.test(value)) continue;
    const v = existing.get(name) ?? figma.variables.createVariable(name, collection, type);
    v.setValueForMode(modeId, type === 'COLOR' ? rgb(value) : type === 'FLOAT' ? parseFloat(value) : value);
    existing.set(name, v);
  }
  return existing;
}

function paint(color: Color, variables: Map<string, Variable>): SolidPaint {
  const solid: SolidPaint = { type: 'SOLID', color: rgb(color.hex), opacity: color.alpha };
  const v = color.token ? variables.get(color.token) : undefined;
  return v ? figma.variables.setBoundVariableForPaint(solid, 'color', v) : solid;
}

const STYLE_BY_WEIGHT: Record<number, string> = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold' };

async function loadFont(family: string, weight: number, italic: boolean, missing: Set<string>): Promise<FontName> {
  const base = STYLE_BY_WEIGHT[weight] ?? 'Regular';
  const style = italic ? (base === 'Regular' ? 'Italic' : `${base} Italic`) : base;
  for (const candidate of [{ family, style }, { family: 'Inter', style }, { family: 'Inter', style: 'Regular' }]) {
    try {
      await figma.loadFontAsync(candidate);
      if (candidate.family !== family) missing.add(`${family} ${style}`);
      return candidate;
    } catch { /* next */ }
  }
  throw new Error('Inter Regular fehlt — Figma-Installation prüfen.');
}

function bytesOf(dataUrl: string): Uint8Array {
  return figma.base64Decode(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

async function build(node: CaptureNode, parent: FrameNode, variables: Map<string, Variable>, missing: Set<string>): Promise<void> {
  if (node.kind === 'svg' && node.svg) {
    const svg = figma.createNodeFromSvg(node.svg.source);
    svg.name = node.name; svg.x = node.x; svg.y = node.y; svg.resize(Math.max(node.width, 0.01), Math.max(node.height, 0.01));
    parent.appendChild(svg);
    return;
  }
  if (node.kind === 'image' && node.image) {
    const rect = figma.createRectangle();
    rect.name = node.name; rect.x = node.x; rect.y = node.y; rect.resize(node.width, node.height);
    rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: figma.createImage(bytesOf(node.image.dataUrl)).hash }];
    rect.opacity = node.opacity;
    parent.appendChild(rect);
    return;
  }
  if (node.kind === 'text' && node.text) {
    const t = figma.createText();
    t.fontName = await loadFont(node.text.family, node.text.weight, node.text.italic, missing);
    t.characters = node.text.content;
    t.fontSize = node.text.size;
    t.lineHeight = { unit: 'PIXELS', value: node.text.lineHeight };
    t.letterSpacing = { unit: 'PIXELS', value: node.text.letterSpacing };
    t.textAlignHorizontal = node.text.align;
    t.fills = [paint(node.text.color, variables)];
    t.x = node.x; t.y = node.y;
    t.resize(Math.max(node.width, 1), Math.max(node.height, 1));
    t.textAutoResize = 'HEIGHT';
    parent.appendChild(t);
    return;
  }
  const f = figma.createFrame();
  f.name = node.name; f.x = node.x; f.y = node.y; f.resize(Math.max(node.width, 0.01), Math.max(node.height, 0.01));
  f.clipsContent = false;
  f.opacity = node.opacity;
  f.fills = node.fill ? [paint(node.fill, variables)] : [];
  if (node.borders) {
    const sides = [node.borders.top, node.borders.right, node.borders.bottom, node.borders.left];
    const first = sides.find((s) => s.width > 0)!;
    f.strokes = [paint(first.color, variables)];
    f.strokeAlign = 'INSIDE';
    f.strokeTopWeight = node.borders.top.width; f.strokeRightWeight = node.borders.right.width;
    f.strokeBottomWeight = node.borders.bottom.width; f.strokeLeftWeight = node.borders.left.width;
  }
  if (node.radii) {
    [f.topLeftRadius, f.topRightRadius, f.bottomRightRadius, f.bottomLeftRadius] = node.radii;
  }
  if (node.shadow) {
    const c = rgb(node.shadow.color.hex);
    f.effects = [{ type: 'DROP_SHADOW', color: { ...c, a: node.shadow.color.alpha }, offset: { x: node.shadow.x, y: node.shadow.y },
      radius: node.shadow.blur, spread: node.shadow.spread, visible: true, blendMode: 'NORMAL' }];
  }
  parent.appendChild(f);
  for (const child of node.children ?? []) await build(child, f, variables, missing);
}

/** One new page per import — never touches frames already designed. */
export async function importCaptures(captures: Capture[], log: (text: string) => void): Promise<void> {
  if (captures.length === 0) { log('Keine Erfassungen gefunden. Erst `npm run showcase:capture` laufen lassen.'); return; }
  const variables = await ensureVariables(captures[0].tokens);
  const page = figma.createPage();
  const now = new Date();
  page.name = `Import ${now.toLocaleDateString('de-DE')} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  await figma.setCurrentPageAsync(page);

  const missing = new Set<string>();
  let x = 0; let y = 0; let rowHeight = 0; let lastOverlay = '';
  for (const capture of captures) {
    if (capture.overlay !== lastOverlay && lastOverlay !== '') { x = 0; y += rowHeight + 160; rowHeight = 0; }
    lastOverlay = capture.overlay;
    const frame = figma.createFrame();
    frame.name = `${capture.overlay} / ${capture.state}`;
    frame.resize(capture.width, capture.height);
    frame.x = x; frame.y = y; frame.fills = []; frame.clipsContent = true;
    page.appendChild(frame);

    const preview = figma.createRectangle();
    preview.name = 'Vorlage';
    preview.resize(capture.width, capture.height);
    preview.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: figma.createImage(bytesOf(capture.preview)).hash }];
    preview.visible = false; preview.locked = true;
    frame.appendChild(preview);

    for (const node of capture.nodes) await build(node, frame, variables, missing);
    log(`${frame.name} ✓`);
    x += capture.width + 120;
    rowHeight = Math.max(rowHeight, capture.height);
  }
  if (missing.size) log(`Ersetzt durch Inter (Schrift fehlt in Figma): ${[...missing].join(', ')}`);
  figma.viewport.scrollAndZoomIntoView(page.children);
  figma.notify(`${captures.length} Zustände eingelesen`);
}
```

- [ ] **Step 3: `figma-plugin/src/code.ts`**

```ts
import { importCaptures, type Capture } from './import';

figma.showUI(__html__, { width: 360, height: 420 });

const log = (text: string) => figma.ui.postMessage({ type: 'log', text });

void figma.clientStorage.getAsync('token').then((token) => {
  figma.ui.postMessage({ type: 'token', token: typeof token === 'string' ? token : '' });
});

figma.ui.onmessage = async (msg: { type: string; token?: string; captures?: Capture[] }) => {
  try {
    if (msg.type === 'save-token') await figma.clientStorage.setAsync('token', msg.token ?? '');
    if (msg.type === 'import') await importCaptures(msg.captures ?? [], log);
  } catch (e) {
    log(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
  }
};
```

- [ ] **Step 4: `figma-plugin/src/ui.html`**

```html
<style>
  body { font: 12px/1.4 Inter, system-ui, sans-serif; margin: 12px; }
  label { display: block; margin-bottom: 4px; color: #666; }
  input { width: 100%; box-sizing: border-box; padding: 6px; margin-bottom: 10px; }
  button { width: 100%; padding: 8px; margin-bottom: 8px; cursor: pointer; }
  #log { white-space: pre-wrap; background: #f5f5f5; padding: 8px; height: 180px; overflow: auto; }
</style>
<label for="token">API-Token des Stream Tools (steht im Log als „Fixed API token")</label>
<input id="token" type="password" placeholder="Token">
<button id="import">Aus NST einlesen</button>
<button id="send">An NST senden</button>
<div id="log"></div>
<script>
  const BASE = 'http://localhost:4000';
  const $ = (id) => document.getElementById(id);
  const log = (t) => { $('log').textContent += t + '\n'; $('log').scrollTop = 1e9; };
  const headers = () => ({ Authorization: 'Bearer ' + $('token').value.trim(), 'Content-Type': 'application/json' });

  $('token').addEventListener('change', () => parent.postMessage({ pluginMessage: { type: 'save-token', token: $('token').value.trim() } }, '*'));

  async function api(path, init) {
    const res = await fetch(BASE + path, { ...init, headers: headers() });
    if (res.status === 401) throw new Error('Token falsch — im Log des Stream Tools nachsehen.');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  $('import').onclick = async () => {
    try {
      const list = await api('/api/design/captures');
      log(`${list.length} Erfassungen gefunden, lade …`);
      const captures = [];
      for (const { overlay, state } of list) captures.push(await api(`/api/design/captures/${overlay}/${state}`));
      parent.postMessage({ pluginMessage: { type: 'import', captures } }, '*');
    } catch (e) {
      log(e.message === 'Failed to fetch' ? 'Stream Tool nicht erreichbar — läuft `npm run dev`?' : 'Fehler: ' + e.message);
    }
  };

  $('send').onclick = () => parent.postMessage({ pluginMessage: { type: 'send-selection' } }, '*');

  onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (!msg) return;
    if (msg.type === 'token') $('token').value = msg.token;
    if (msg.type === 'log') log(msg.text);
  };
</script>
```

- [ ] **Step 5: Bauen und Typen prüfen**

Run: `npm --prefix figma-plugin run typecheck` → Exit 0; `npm --prefix figma-plugin run build` → „figma-plugin gebaut → dist/".

- [ ] **Step 6: Commit**

```bash
git add figma-plugin/manifest.json figma-plugin/package.json figma-plugin/package-lock.json figma-plugin/tsconfig.json figma-plugin/build.mjs figma-plugin/src
git commit -m "feat(figma-plugin): import showcase captures as editable frames with NST variables"
```

Prüfen in Figma macht der Nutzer (Task 8). Dem Nutzer den Einrichtungsweg nennen: Figma Desktop → *Plugins → Entwicklung → Plugin aus Manifest importieren…* → `D:\dev\stream-toolkit\figma-plugin\manifest.json`.

---

### Task 6: Figma-Plugin — An NST senden

**Files:**
- Create: `figma-plugin/src/export.ts`
- Modify: `figma-plugin/src/code.ts`, `figma-plugin/src/ui.html`

**Interfaces:**
- Consumes: `POST /api/design/inbox`, `GET /api/design/states` (beide Task 4).
- Produces `figma-plugin/src/export.ts`:
  ```ts
  export type Draft = { frameId: string; frameName: string; overlay: string | null; state: string | null;
                        draft: DraftTree; image: string; image2x: string };   // PNGs base64
  export async function exportSelection(): Promise<Draft[]>;
  ```
  `DraftTree` = `{ name, type, x, y, width, height, opacity, fills, strokes, strokeWeights, radii, effects, layout?, text?, component?, children?, variables }` (siehe Code).

- [ ] **Step 1: `figma-plugin/src/export.ts`**

```ts
type Json = Record<string, unknown>;

async function variableName(id: string | undefined): Promise<string | undefined> {
  if (!id) return undefined;
  return (await figma.variables.getVariableByIdAsync(id))?.name;
}

async function paints(list: readonly Paint[] | typeof figma.mixed): Promise<Json[]> {
  if (list === figma.mixed) return [];
  const out: Json[] = [];
  for (const p of list) {
    if (p.type === 'SOLID') {
      const c = p.color;
      const hex = '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
      out.push({ type: 'SOLID', hex, alpha: p.opacity ?? 1, variable: await variableName(p.boundVariables?.color?.id), visible: p.visible !== false });
    } else {
      out.push({ type: p.type, visible: p.visible !== false });
    }
  }
  return out;
}

async function tree(node: SceneNode): Promise<Json> {
  const out: Json = { name: node.name, type: node.type, x: node.x, y: node.y, width: node.width, height: node.height, visible: node.visible };
  if ('opacity' in node) out.opacity = node.opacity;
  if ('fills' in node) out.fills = await paints(node.fills);
  if ('strokes' in node) out.strokes = await paints(node.strokes);
  if ('strokeTopWeight' in node) out.strokeWeights = [node.strokeTopWeight, node.strokeRightWeight, node.strokeBottomWeight, node.strokeLeftWeight];
  if ('topLeftRadius' in node) out.radii = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius];
  if ('effects' in node) out.effects = node.effects.map((e) => ({ ...e }));
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    out.layout = { mode: node.layoutMode, gap: node.itemSpacing, padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft],
      primaryAlign: node.primaryAxisAlignItems, counterAlign: node.counterAxisAlignItems };
  }
  if (node.type === 'TEXT') {
    out.text = { characters: node.characters, fontName: node.fontName === figma.mixed ? 'mixed' : node.fontName,
      fontSize: node.fontSize === figma.mixed ? 'mixed' : node.fontSize, lineHeight: node.lineHeight === figma.mixed ? 'mixed' : node.lineHeight,
      letterSpacing: node.letterSpacing === figma.mixed ? 'mixed' : node.letterSpacing, align: node.textAlignHorizontal,
      textCase: node.textCase === figma.mixed ? 'mixed' : node.textCase };
  }
  if (node.type === 'INSTANCE') out.component = (await node.getMainComponentAsync())?.name;
  if ('children' in node) out.children = await Promise.all(node.children.filter((c) => c.name !== 'Vorlage').map(tree));
  return out;
}

async function variableValues(): Promise<Json> {
  const collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'NST');
  if (!collection) return {};
  const modeId = collection.modes[0].modeId;
  const values: Json = {};
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) values[v.name] = v.valuesByMode[modeId];
  }
  return values;
}

export type Draft = { frameId: string; frameName: string; overlay: string | null; state: string | null; draft: Json; image: string; image2x: string };

export async function exportSelection(): Promise<Draft[]> {
  const frames = figma.currentPage.selection.filter((n): n is FrameNode => n.type === 'FRAME');
  const variables = await variableValues();
  const drafts: Draft[] = [];
  for (const frame of frames) {
    const m = frame.name.match(/^\s*([a-z0-9-]+)\s*\/\s*([a-z0-9-]+)\s*$/);
    const draft = { ...(await tree(frame)), variables };
    const image = figma.base64Encode(await frame.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } }));
    const image2x = figma.base64Encode(await frame.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } }));
    drafts.push({ frameId: frame.id, frameName: frame.name, overlay: m ? m[1] : null, state: m ? m[2] : null, draft, image, image2x });
  }
  return drafts;
}
```

- [ ] **Step 2: `code.ts` erweitern** — Import ergänzen und im `onmessage` eine Zeile:

```ts
import { exportSelection } from './export';
// …
    if (msg.type === 'send-selection') {
      const drafts = await exportSelection();
      if (drafts.length === 0) log('Keinen Frame markiert.');
      else figma.ui.postMessage({ type: 'drafts', drafts });
    }
```

- [ ] **Step 3: `ui.html` erweitern** — vor `</script>` ergänzen; im bestehenden `onmessage` die Zeile `if (msg.type === 'drafts') sendDrafts(msg.drafts);` hinzufügen:

```js
  // Names the plugin does not know are not guessed: the user picks from the list.
  async function sendDrafts(drafts) {
    let known;
    try {
      known = (await api('/api/design/states')).overlays;
    } catch {
      log('Stream Tool nicht erreichbar — läuft `npm run dev`?');
      return;
    }
    for (const d of drafts) {
      let target = d.overlay && known[d.overlay] && known[d.overlay].states[d.state] ? `${d.overlay}/${d.state}` : null;
      if (!target) {
        const options = Object.entries(known).flatMap(([o, e]) => Object.keys(e.states).map((s) => `${o}/${s}`));
        target = await pick(d.frameName, options);
        if (!target) { log(`${d.frameName}: übersprungen`); continue; }
      }
      const [overlay, state] = target.split('/');
      try {
        const res = await api('/api/design/inbox', { method: 'POST', body: JSON.stringify({ overlay, state, draft: d.draft, image: d.image, image2x: d.image2x }) });
        log(`${d.frameName} → ${res.saved} ✓`);
      } catch (e) {
        log(`${d.frameName}: ${e.message}`);
      }
    }
  }

  function pick(frameName, options) {
    return new Promise((resolve) => {
      const box = document.createElement('div');
      box.innerHTML = `<label>„${frameName}" gehört zu:</label><select style="width:100%;margin-bottom:6px"><option value="">— überspringen —</option>${options.map((o) => `<option>${o}</option>`).join('')}</select><button>OK</button>`;
      document.body.insertBefore(box, $('log'));
      box.querySelector('button').onclick = () => { const v = box.querySelector('select').value; box.remove(); resolve(v || null); };
    });
  }
```

- [ ] **Step 4: Bauen, Typen** — `npm --prefix figma-plugin run typecheck` und `npm --prefix figma-plugin run build`, beide Exit 0.

- [ ] **Step 5: Commit**

```bash
git add figma-plugin/src
git commit -m "feat(figma-plugin): send selected frames back to NST as drafts"
```

---

### Task 7: Vergleich, Anleitung, Aufräumen

**Files:**
- Create: `scripts/showcase-compare.mjs`, `docs/design-workflow.md`
- Delete: `docs/overlay-variablen.md`
- Modify: `package.json` (Skript `showcase:compare`)

**Interfaces:**
- Consumes: `openState`, `launch`, `readStates`, `requireRunningTool` (Task 3); `design/drafts/<overlay>/<state>/image.png` (Task 4).
- Produces: `design/compare/<overlay>/<state>.png` und eine Zeile je Zustand mit Abweichung in Prozent.

- [ ] **Step 1: `scripts/showcase-compare.mjs`**

```js
import fs from 'fs';
import path from 'path';
import { launch, openState, readStates, requireRunningTool } from './showcase-browser.mjs';

// Draft left, overlay right, differences below. Usage: npm run showcase:compare -- <overlay>
const overlay = process.argv[2];
if (!overlay) { console.error('Aufruf: npm run showcase:compare -- <overlay>'); process.exit(1); }
await requireRunningTool();
const entry = (await readStates()).overlays[overlay];
if (!entry) { console.error(`Unbekanntes Overlay: ${overlay}`); process.exit(1); }

const browser = await launch();
try {
  for (const state of Object.keys(entry.states)) {
    const draftFile = path.join(process.cwd(), 'design', 'drafts', overlay, state, 'image.png');
    if (!fs.existsSync(draftFile)) { console.log(`--   ${overlay} / ${state} — kein Entwurf`); continue; }
    const { page } = await openState(browser, overlay, state, entry.size);
    const rendered = (await page.screenshot({ omitBackground: true })).toString('base64');
    await page.close();
    const draft = fs.readFileSync(draftFile).toString('base64');

    // The diff is computed in a canvas, so no image library is needed.
    const { width, height } = entry.size;
    const sheet = await browser.newPage({ viewport: { width: width * 2 + 24, height: height * 2 + 24 } });
    await sheet.setContent(`<body style="margin:0;background:#888"><canvas id="c" width="${width * 2 + 24}" height="${height * 2 + 24}"></canvas></body>`);
    const percent = await sheet.evaluate(async ({ draft, rendered, width, height }) => {
      const load = (b64) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b64; });
      const [a, b] = await Promise.all([load(draft), load(rendered)]);
      const ctx = document.getElementById('c').getContext('2d');
      ctx.drawImage(a, 0, 0, width, height);
      ctx.drawImage(b, width + 24, 0, width, height);
      const pa = ctx.getImageData(0, 0, width, height).data;
      const pb = ctx.getImageData(width + 24, 0, width, height).data;
      const diff = ctx.createImageData(width, height);
      let off = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) + Math.abs(pa[i + 3] - pb[i + 3]);
        const bad = d > 48;
        if (bad) off++;
        diff.data[i] = bad ? 255 : pa[i] * 0.25; diff.data[i + 1] = bad ? 0 : pa[i + 1] * 0.25; diff.data[i + 2] = bad ? 80 : pa[i + 2] * 0.25; diff.data[i + 3] = 255;
      }
      ctx.putImageData(diff, 0, height + 24);
      return (off / (width * height)) * 100;
    }, { draft, rendered, width, height });
    const out = path.join(process.cwd(), 'design', 'compare', overlay, `${state}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sheet.screenshot({ path: out });
    await sheet.close();
    console.log(`${percent < 2 ? 'ok  ' : 'diff'} ${overlay} / ${state} — ${percent.toFixed(1)} % abweichend → ${path.relative(process.cwd(), out)}`);
  }
} finally {
  await browser.close();
}
```

`package.json` → `"showcase:compare": "node scripts/showcase-compare.mjs",`

- [ ] **Step 2: `docs/design-workflow.md`**

```markdown
# Overlays gestalten — Figma hin und zurück

Spezifikation: `docs/superpowers/specs/2026-09-21-overlay-design-workflow-design.md`.

## Einmal einrichten

1. `npm --prefix figma-plugin install` und `npm --prefix figma-plugin run build`. — überholt: siehe docs/design-workflow.md (cd figma-plugin && npm install)
2. Figma Desktop → *Plugins → Entwicklung → Plugin aus Manifest importieren…* →
   `figma-plugin/manifest.json`.
3. Plugin „NST-Brücke" öffnen, das API-Token eintragen. Es steht beim Start des
   Tools im Log: `[Auth] Fixed API token: …`.

## Ansehen

`http://localhost:4000/overlay/showcase/` — jedes Overlay in jedem Zustand, mit
Testdaten. Nichts davon erreicht OBS. Zustände und Größen stehen in
`src/overlays/showcase/states.json`; ein Zustand einzeln:
`/overlay/<name>/index.html?state=<zustand>`.

## Nach Figma

1. Tool läuft (`npm run dev`).
2. `npm run showcase:capture` (oder `-- <overlay>` für eins).
3. Im Plugin **Aus NST einlesen** — landet auf einer neuen Seite „Import …",
   Farben an die Variablen der Sammlung „NST" gebunden, das Originalbild als
   ausgeblendete Ebene „Vorlage" in jedem Frame.

## Zurück

1. Frames heißen `<overlay> / <zustand>` (so wie beim Import).
2. Frames markieren → **An NST senden**. Landet in
   `design/drafts/<overlay>/<zustand>/` (Entwurf, 1x- und 2x-Bild).
3. Bescheid sagen: „character ist fertig". Umgesetzt wird mit
   `npm run showcase:compare -- <overlay>` als Abgleich.
```

- [ ] **Step 3: Alte Doku entfernen** — `git rm docs/overlay-variablen.md`

- [ ] **Step 4: typecheck / test / lint einzeln, Commit**

```bash
git add scripts/showcase-compare.mjs docs/design-workflow.md package.json
git commit -m "feat(design): compare drafts with the rendered overlay; document the round trip"
```

---

### Task 8: Pilot `character` — einmal den ganzen Kreis

Kein Code im Voraus; diese Aufgabe führt der Controller mit dem Nutzer zusammen.

- [ ] **Step 1:** Tool läuft? `npm run showcase:capture -- character` → drei `ok`-Zeilen.
- [ ] **Step 2:** Nutzer richtet das Plugin ein (docs/design-workflow.md) und liest ein. Rückmeldung einholen: Stimmt der Frame optisch mit der „Vorlage"-Ebene überein? Welche Schriften wurden ersetzt? Abweichungen, die das Weiterarbeiten stören, als Fix in `capture-dom.js` / `import.ts` beheben (eigener Commit je Fix).
- [ ] **Step 3:** Nutzer ändert etwas Sichtbares an `character / with-portrait` und sendet es. Prüfen: `design/drafts/character/with-portrait/` hat `draft.json`, `image.png`, `image@2x.png`; `draft.json` enthält an Variablen gebundene Füllungen (`"variable": "--color-…"`).
- [ ] **Step 4:** Die Änderung im Overlay umsetzen, `npm run showcase:compare -- character`, das Vergleichsbild ansehen und nacharbeiten, bis `ok`. Dem Nutzer das Vergleichsbild zeigen.
- [ ] **Step 5:** OBS-Quelle per Screenshot prüfen (OBS-WebSocket, `GetSourceScreenshot`). Keine Test-Ereignisse ohne Ansage.
- [ ] **Step 6:** `design/drafts/character/` und die Overlay-Änderung committen: `git commit -m "design(character): first overlay through the Figma round trip"`. Push erst nach Rückfrage.
```
