# Einrichtung beim ersten Start — Design

> Entworfen am 06.10.2026, direkt nach dem Umbau der Bedienung. Klickbarer Prototyp:
> Claude-Design-Leinwand „NST Einrichtung“ (https://claude.ai/artifact/HK7HWuabK96MTVkEysi6iF),
> fünf Bildschirme. Von Nils am 06.10. abgenommen („okay dann passt alles so“).

## Worum es geht

Wer das Tool frisch installiert, sieht heute alles auf einmal: sechs Karten unter „Im Stream“,
sechzehn Overlays, Befehle, Alerts, Meilensteine, Kanalpunkte. Vieles davon braucht er nicht,
und nichts sagt ihm, was er dafür verbinden oder in OBS anlegen müsste.

Die Einrichtung fragt beim ersten Start **„Was soll dein Stream können?“**, verbindet danach nur,
was die Auswahl braucht, legt die Browserquellen in OBS an und zeigt zum Schluss, was steht und
was noch fehlt. Die App zeigt danach nur die gewählten Funktionen. Alles Ausgeblendete bleibt
erhalten und ist unter Einstellungen → Programm → „Was dein Stream kann“ wieder einschaltbar.

## Entscheidungen

- **Vier Schritte, jeder überspringbar:** Können · Verbinden · In OBS einrichten · Fertig. Links
  eine Schrittleiste statt der Seitenleiste, rechts der Schritt. Unten „Zurück“, „Weiter: …“ und
  „Später einrichten“. Die Einrichtung ist ein Vollbild in der App, kein Dialog.
- **Sechzehn Funktionen in vier Gruppen,** benannt wie die Seitenleiste: *Im Chat*, *Overlays*,
  *Mit Kanalpunkten*, *Nach dem Stream*. Jede Funktion ist eine Karte mit Namen, einem Satz und
  dem Hinweis, was sie braucht („braucht Twitch und OBS“). Unten die Zeile „8 ausgewählt · dafür
  brauchst du Twitch · OBS · Discord“.
- **Vorauswahl in Schritt 1:** Chat im Stream, Alerts, Momente merken. Drei Dinge, die jeder
  Stream brauchen kann und die außer Twitch und OBS nichts voraussetzen. Solange keine Auswahl
  gespeichert ist – auch wer die Einrichtung überspringt –, ist alles an, wie bisher.
- **Nils' persönliche Funktionen** – die Worldbuilder-Anbindung, die Eintragskarte aus der Welt und
  Start-, Pausen- und Endbild – gehören nicht in die Einrichtung für andere. Sie bilden eine fünfte
  Gruppe **„Welt“**, die nur erscheint, wenn der Worldbuilder auf dem Rechner eingerichtet ist
  (`~/.worldbuilder/anschluss.json` existiert). Niemand sonst hat die Datei, also sieht sie niemand
  sonst. Bei Nils sind sie an wie heute – auch wenn der Worldbuilder gerade nicht läuft, dann sagt
  es der Hinweisbalken.
- **Bestehende Installationen sehen keine Einrichtung.** Die Migration auf Schema v26 setzt bei
  einer Datenbank, die es schon gab, `setup_done` und schaltet alle Funktionen an. Nur eine neue
  Datenbank startet mit der Einrichtung.
- **Verbinden zeigt nur, was die Auswahl braucht:** Twitch, OBS, Discord, bei Nils den
  Worldbuilder. Die Kästen sind dieselben wie unter Einstellungen → Verbindungen, aus einem
  Baustein. Notion und GitHub bleiben in den Einstellungen; sie gehören zu keiner Funktion.
- **OBS einrichten legt die Browserquellen an.** Der Code existiert für die Start-, Pausen- und
  Endbilder bereits (`CreateInput browser_source`). Für jedes Overlay einer gewählten Funktion:
  Name, Satz, Größe aus dem Katalog, Szene wählen, „In OBS anlegen“ – oder „Alle in OBS anlegen“
  mit einer Szene für alle. Was in OBS schon liegt (`overlaysByScene`), wird erkannt und nicht
  doppelt angelegt. Ohne OBS-Verbindung sagt der Schritt das und zeigt die Adressen zum Kopieren.
- **Fertig** zeigt drei Spalten: was der Stream kann und wo es in der App liegt, was steht und was
  fehlt (die Bereitschaftsliste), und welche Belohnungen in Twitch anzulegen sind, damit das Tool
  sie am Namen erkennt (Roulette, Musik oder Song, Szene; alles andere zählt für die Bestenliste).
  Belohnungen aus dem Tool heraus anlegen bleibt #24.
- **Kein erster Befehl in der Einrichtung.** „Fertig“ nennt den fehlenden eigenen Befehl als
  offenen Punkt mit Sprung zu Chat & Bot. Die Einrichtung bleibt dadurch kurz.
- **Die Auswahl blendet aus, sie löscht nicht.** Karten unter „Im Stream“, Overlays in der Liste,
  Unterreiter, eingebaute Befehle, Tastenkürzel und Prüfpunkte im Hinweisbalken richten sich nach
  der Auswahl. Daten bleiben; der Bot antwortet auf einen ausgeschalteten Befehl nicht, `!befehle`
  nennt ihn nicht.
- **Später:** Einstellungen → Programm bekommt oben die Karte „Was dein Stream kann“ – Chips der
  gewählten Funktionen, „Ändern“ öffnet Schritt 1, „Einrichtung noch einmal durchgehen“ öffnet
  alle vier Schritte mit dem, was schon steht.

## Die Funktionen und was sie steuern

Eine Quelle für Server und Oberfläche: `src/shared/features.ts`. Je Funktion: Schlüssel, Gruppe,
Name, Satz, Verbindungen (`twitch`, `obs`, `discord`, `worldbuilder`), Overlays (Ordnernamen),
eingebaute Befehle (Schlüssel aus `DEFAULT_COMMANDS`), Panels, Tastenkürzel, Prüfpunkte.

| Gruppe | Schlüssel | Name | braucht | Overlays | Befehle | Panels | Kürzel | Prüfpunkte |
|---|---|---|---|---|---|---|---|---|
| Im Chat | `befehle` | Erklär-Befehle | twitch | – | commands | – | – | commands |
| | `musik` | Musikwünsche | twitch | – | sr, queue | song | – | – |
| | `rad` | Glücksrad | twitch, obs | roulette | issues | issues | roulette | – |
| | `vote` | Abstimmung | twitch, obs | poll | vote, design | designs | – | – |
| | `shoutout` | Raid-Gruß von selbst | twitch | – | shoutout | – | – | – |
| Overlays | `chat` | Chat im Stream | twitch, obs | chat | – | – | – | – |
| | `song` | Musik mit Cover | obs | song | song | song | – | – |
| | `ziel` | Ziel für heute | obs | challenge | challenge | challenge | challenge_toggle, timer_toggle, challenge_done, challenge_failed | – |
| | `fortschritt` | Aufgaben und Fortschritt | obs | progress, todos | todo, progress | progress | – | – |
| | `alerts` | Alerts | twitch, obs | alerts | – | alerts | – | alertSounds |
| Mit Kanalpunkten | `bestenliste` | Bestenliste | twitch, obs | reward-leaderboard, reward-rankchange | rewardstats | rewardstats | – | – |
| | `belohnungen` | Belohnungen auslösen | twitch, obs | – | scene | obs | – | – |
| Nach dem Stream | `momente` | Momente merken und Content planen | – | – | hype | clips | hype_moment | – |
| | `autoclips` | Hype von selbst erkennen | twitch | – | – | autoclips | – | – |
| | `meilensteine` | Meilensteine feiern | obs | milestone | – | milestones | milestone_minor, milestone_major, milestone_epic | – |
| | `discord` | Live-Meldung nach Discord | discord | – | – | – | – | – |
| Welt (nur mit Worldbuilder) | `welt` | Eintragskarte aus der Welt | obs, worldbuilder | character | – | world | – | worldbuilder |
| | `bilder` | Start-, Pausen- und Endbild | obs | start, pause, end | – | obs | – | scenes |

Regeln:

- Ein Panel ist sichtbar, wenn keine Funktion es beansprucht oder eine beanspruchende Funktion an
  ist. Ein Unterreiter ist sichtbar, wenn er ein sichtbares Panel hat; ein Bereich, wenn er einen
  sichtbaren Unterreiter hat. „Statistik“, „Befehle“, „Von selbst“, „Ausprobieren“, „Overlays“,
  „Aussehen“, Einstellungen und Hilfe sind immer da.
- Die Karte „Moment merken“ unter „Im Stream“ hängt an `momente`.
- Die Prüfpunkte `twitch` und `obs` bleiben, solange eine gewählte Funktion sie braucht;
  `overlays` („Browserquellen in OBS“) bleibt, solange eine gewählte Funktion ein Overlay hat.
- Die Verbindungskarte „Discord“ erscheint in der Einrichtung nur mit `discord`; in den
  Einstellungen bleibt sie immer.
- `welt` und `bilder` werden nur angezeigt und nur angenommen, wenn der Worldbuilder eingerichtet
  ist. Fehlt die Datei, zählen sie als aus.

## Server

- **Schema v26.** Keine neue Tabelle. Die Migration setzt bei `from > 0` die Einstellungen
  `setup_done = '1'` und `features = <alle Schlüssel>`.
- **`src/server/features.ts`:** `getFeatures()` liest `features` (JSON-Liste) – fehlt sie, ist
  alles an; Welt-Schlüssel nur mit Worldbuilder. `saveFeatures()`
  prüft die Schlüssel. `featureOn(key)`, `commandEnabled(commandKey)`, `overlayEnabled(name)`.
- **`GET /api/setup`** → `{ done, features, worldbuilder, defaults }`. **`PUT /api/setup/features`**
  `{ features: [] }` → speichert, antwortet mit der Liste, sendet `features-changed`.
  **`POST /api/setup/done`** setzt `setup_done`.
- **`POST /api/obs/place-overlay`** `{ overlay, scene }` → legt die Browserquelle `NST <Name>` mit
  der Katalog-Größe in der Szene an (`CreateInput`, bei vorhandener Quelle `CreateSceneItem`);
  liegt das Overlay schon in einer Szene, antwortet `{ status: 'exists', scene }`. Ohne OBS 409.
  Reine Funktion `placeOverlay(obs, …)` in `src/server/obs/place-overlay.ts`, mit Stand-in testbar.
- **Bereitschaft** filtert ihre Punkte nach den Funktionen. **Katalog** trägt je Overlay `feature`.
  **`GET /api/commands`** und `!befehle` lassen eingebaute Befehle ausgeschalteter Funktionen weg;
  der Bot antwortet auf sie nicht.

## Oberfläche

- **`FeaturesContext`** (`/api/setup`, hört auf `features-changed`): `isOn(key)`, `panelVisible`,
  `visibleAreas`, `worldbuilder`, `done`.
- **`navigation.ts`:** `visibleNavigation(features, worldbuilder)` als reine Funktion, getestet.
- **`Shell`:** ist `done` falsch, zeigt die App die Einrichtung statt der Seitenleiste. Danach
  normal. Gespeicherter Unterreiter, der verschwunden ist → erster sichtbare.
- **`pages/SetupPage.tsx`** mit `steps/{Features,Connections,ObsSetup,Finish}.tsx`. Schritt 2 nutzt
  `components/settings/ConnectionCards.tsx` (`only`-Prop), das aus `SettingsPanel` herausgelöst
  wird; die Einstellungen rendern denselben Baustein.
- **Filter:** `StreamPage` (Karten, Moment-Karte), `AreaPage`/`SubTabs` (über `visibleAreas`),
  `OverlaysPanel` (Katalog nach `feature`), `HotkeysPanel` (Zeilen), `ObsPanel` (Abschnitt
  „Start, Pause, Ende“ nur mit `bilder`), `ConnectionMarks` (Worldbuilder nur, wenn eingerichtet).
- **Einstellungen → Programm:** Karte „Was dein Stream kann“ oben.
- **Hilfe:** Abschnitt „Einrichtung“ und „Was dein Stream kann“ in „Erste Schritte“.

## Nicht in diesem Entwurf

Belohnungen in Twitch anlegen (#24). Ein erster Befehl in der Einrichtung. Tastenkürzel im
Hauptprozess abschalten – sie bleiben registriert, nur die Zeilen verschwinden. Ein Schalter
„Welt-Funktionen immer anzeigen“ – die Datei des Worldbuilders reicht.

## Stufen

1. **Server:** `shared/features.ts`, `server/features.ts`, Schema v26, Setup-Routen, Katalog mit
   `feature`, Bereitschaft und Befehle gefiltert, `place-overlay`. Tests an der HTTP-Naht.
2. **Oberfläche:** Kontext, Navigation gefiltert, Einrichtung mit vier Schritten,
   `ConnectionCards`, Karte in den Einstellungen, Filter in den Panels, Hilfe.
3. **Abschluss:** Durchlauf, Screenshots, STAND, CONTEXT, Plan, Issue.
