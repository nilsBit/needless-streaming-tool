---
name: stand-sichern
description: Den Arbeitsstand von NST sichern – prüfen, docs/STAND.md mit „Hier aufgehört“ und „Was noch zu tun ist“ fortschreiben, committen und pushen. Benutzen, wenn Nils sagt „push alles“, „stand sichern“, „wo wir stehen geblieben sind pushen“ oder /stand-sichern tippt.
---

# Stand sichern

Nils ruft das am Ende einer Etappe auf, oft bevor er den Rechner wechselt
(Mac ↔ Windows). Danach muss eine neue Session auf dem anderen Rechner allein
aus `docs/STAND.md` und `git pull` weitermachen können.

Der Aufruf **ist** Nils' Wort zum Pushen – für dieses Repo. (Bitcaster nie.)

## Ablauf

1. **Lage ansehen.** `git fetch`, `git status -sb`, `git log origin/main..HEAD --oneline`.
   Liegt der Remote vorn (der andere Rechner hat gepusht): erst `git pull --rebase`.
   Kein `git stash` – das löste Neustarts des Dev-Servers aus.
   `.DS_Store` wird nie committet.

2. **Prüfen** – alle drei, Exit-Code jeweils über `$?` holen (zsh, keine Pipe mit set -e):
   - `npm run typecheck`
   - `npm run lint` (Warnungen ok, Fehler nicht)
   - `npx vitest run --pool=threads` (der Standard-Pool bricht neben dem
     laufenden Dev-Tool gern mit `ERR_IPC_CHANNEL_CLOSED` ab; ein einzelner
     Ausreißer → einmal wiederholen und in STAND.md notieren)
   Rot → nicht pushen, Nils sagen, was rot ist.

3. **Sicherheit und Korrektheit** des gesamten neuen Codes (`git diff origin/main`
   plus Uncommittetes): Eingaben an Server-Routen geprüft? Pfade und Namen in
   URLs mit `encodeURIComponent`? Kein `dangerouslySetInnerHTML`, kein `eval`,
   keine Tokens/Webhooks im Diff oder in `data/`? Fund → beheben oder Nils fragen.

4. **Hilfe** (`src/renderer/src/docs/help-de.ts`) beschreibt, was sich für den
   Nutzer geändert hat? Sonst nachziehen.

5. **`docs/STAND.md` fortschreiben** – unter „## Wo wir stehen geblieben sind“
   ganz oben ein neuer Block (ältere Blöcke bleiben):

   ```
   **Hier aufgehört (TT.MM. morgens|mittags|nachmittags|abends, Mac|unter Windows)** – alles gepusht

   - Was gebaut/entschieden wurde, je Punkt kurz; Nils' Worte zitieren, wo sie
     eine Entscheidung begründen. Abweichungen vom Leinwand-Entwurf nennen.
   - Was bewusst nicht gemacht wurde und warum.
   - **Was noch zu tun ist:**
     1. … (nummeriert, das Nächste zuerst; wer es tut, wenn es Nils ist)
   ```

   Gab es heute schon einen Block von diesem Rechner, den ergänzen statt einen
   zweiten anzulegen. Echte Umlaute (ä ö ü ß). Datum aus der Umgebung, nicht raten.

6. **Committen** – englisch, Conventional Commits (`feat(…)`, `fix(…)`,
   `docs(stand): …`), am Ende:

   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```

   (Die Zeile aus der aktuellen System-Erinnerung nehmen, falls sie abweicht.)

7. **Pushen**: `git push`. Danach `git status -sb` → muss `## main...origin/main` ohne „voraus“ zeigen.

8. **Drumherum**:
   - Offene GitHub-Issues, die die Arbeit betrifft: kurzer Kommentar mit Commit
     (`gh issue comment <n> --body …`). Schließen nur, wenn Nils es abgenommen hat.
   - Memory (`~/.claude/projects/…/memory/`) zum Projekt aktualisieren, falls vorhanden.

9. **Nils berichten** – deutsch, kurz: was gepusht ist (letzter Commit), ob
   alles grün war, und die Liste „Was noch zu tun ist“.

## Nicht

- Keinen Dev-Server starten oder beenden, keine Builds (`npm run build` u. ä.).
- Keine Release-Version taggen – `npm version …` macht Nils selbst.
- Keine Dateien aus `data/` committen außer `stream.seed.db`, und die nur
  bereinigt (ohne Twitch-/Notion-Token, Webhook, `api_token`, `design_token`).
