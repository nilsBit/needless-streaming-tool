# Eigene Punkte — Umsetzungsplan

> Zur Spec `docs/superpowers/specs/2026-10-08-eigene-punkte-design.md`, Issue #28.
> Jede Stufe ist für sich nutzbar, endet mit grünem Typecheck, Lint und Tests und wird einzeln
> committet.

## Stufe 1 — Konto und Verdienen

Ziel: Im Stream sammeln Zuschauer Punkte, die App kann sie anzeigen, geben und nehmen.

- `src/server/db/schema.ts`: Tabellen `viewer_points` und `point_rewards`, `SCHEMA_VERSION` 29.
  Neue Tabellen brauchen keine Migration (CREATE IF NOT EXISTS), nur den Versionssprung.
- `src/server/points/config.ts`: `getPointsConfig()` / `savePointsConfig()` unter `points_config`
  mit Standardwerten (Währung „Punkte“, Raten der Spec, Bot-Liste), Prüfung: ganze Zahlen ≥ 0.
- `src/server/points/ledger.ts`: das Konto, ohne Verbindungen.
  - `credit(login, displayName, amount)` — nur live, nie für Bot/Broadcaster/Bot-Liste; erhöht
    `balance`, `total`, `stream_total`, setzt `last_earned_at`.
  - `adjust(login, amount)` — Mods; negativ zieht von `balance` und `total`, nie unter null.
  - `standing(login)` — Guthaben, Beitrag, Platz.
  - `topByTotal(limit, scope: 'all' | 'stream')`, `searchViewers(q)`.
  - `startStream()` — `stream_total` aller auf null.
- `src/server/points/live.ts`: `isLive()`, `setLive(boolean)`; beim Wechsel auf live
  `startStream()`.
- `src/server/points/earn.ts`: die Quellen.
  - `onChatMessage(tags)` — 1 je Minute je Zuschauer (Sperre im Speicher).
  - `onFollow`, `onSub`, `onGift(count)`, `onRaid`, `onBits(bits)`.
  - `watchTick(helix)` — `GET /chat/chatters?broadcaster_id&moderator_id`, mit Seiten; Fehler
    401/403 → Hinweis wie bei den Follows.
- Anschlüsse (nur in `startServer()` bzw. dem Bot):
  - `src/server/bot/events.ts`: Chat, Sub, Resub, Gift (über den Geschenk-Zähler), Raid, Cheer.
  - `src/server/bot/eventsub.ts`: `channel.follow` → `onFollow`; neue Abos `stream.online` /
    `stream.offline` → `setLive`; nach dem Verbinden einmal `GET /streams?user_id=` für den
    Start mitten im Stream.
  - Takt alle 10 Minuten in `startServer()`, nur wenn das Feature an ist.
  - `src/server/api/auth.ts`: `moderator:read:chatters` in `TWITCH_SCOPES`.
- `src/shared/features.ts`: Feature `punkte` (Gruppe `chat`), Befehle `points`, `rewards_list`,
  `redeem`, Panel `points`, nicht in `DEFAULT_FEATURES`.
- `src/server/api/points.ts` unter `/api/points`: `GET/PUT config`, `GET viewers?q=`,
  `POST viewers/:login/adjust`.
- Datenschutz: `forgetViewer` und `pruneViewerData` (`src/server/retention.ts`) um
  `viewer_points`; `privacySentence()` nennt Punkte, wenn das Feature an ist.
- Tests `src/server/__tests__/points.test.ts`:
  - Config: Standard, speichern, 400 bei negativ.
  - Offline verdient niemand; live gutgeschrieben, Bots und Broadcaster nicht.
  - Chat-Sperre je Minute (Uhr als Parameter).
  - Geschenk zählt einmal; Bits abgerundet.
  - `watchTick` gegen einen Helix-Stub (Funktion wie in `shoutout.test.ts`): alle Seiten, Bots raus.
  - Geben/Nehmen über die Route, nie unter null; Suche; Vergessen; Ablauf nach einem Jahr.
  - `startStream()` setzt den Stream-Beitrag zurück, der Gesamtbeitrag bleibt.

## Stufe 2 — Ausgeben

- `src/server/actions/index.ts`: `runAction(key, { user, input, sceneName })` für `roulette`,
  `feature_request`, `change_music`, `scene`, `alert`; gibt Erfolg oder Grund zurück.
  `handleRedemption` ruft es nach der Namenserkennung auf (Verhalten unverändert).
- `point_rewards` verwalten: `GET/POST/PATCH/DELETE /api/points/rewards`, Name eindeutig ohne
  Groß/klein, Preis > 0, Szene nur aus den Szenen-Zuordnungen.
- `src/server/points/redeem.ts`: `redeem(login, displayName, name, input, now)` — Prüfungen,
  Abzug, `runAction`, Rückbuchung bei Fehlschlag, Alert `punkte-einloesung`, Sperrzeit.
- `POST /api/points/viewers/:login/redeem` ruft `redeem` auf (Entscheidung vom 08.10.).
- Chat: `!punkte` (mit `geben`/`nehmen` für Mods), `!belohnungen`, `!einlösen` in
  `src/server/bot/commands.ts` und `DEFAULT_COMMANDS`.
- Tests: Verwaltung, alle Fälle von `redeem` über die Route, Szene nur aus der Auswahl.

## Stufe 3 — Im Stream und in der App

- `src/server/reward-leaderboard.ts`: Schlüssel `beitrag` und `beitrag-stream` lesen aus
  `viewer_points`; Rangwechsel nach jedem `credit`.
- Alerts-Overlay: Karte für `punkte-einloesung`.
- Renderer: Unterreiter **Punkte** unter Chat & Bot (`navigation.ts`, Panel `points`) mit
  Einstellungen, Belohnungen (Dialog) und Zuschauern (Geben/Nehmen/Für jemanden einlösen).
- `CONTEXT.md`, Hilfeseite, `docs/STAND.md`.
- Tests: `/public/…` für beide Schlüssel; `navigation.test.ts` kennt das neue Panel.
- Durchlauf mit `npm run ui:walk`.
