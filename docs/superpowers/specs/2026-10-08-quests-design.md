# Quests — Design

> Entworfen am 08.10.2026. Nils hat auf der Leinwand („Belohnung anlegen – geführt, mit
> Gamification“) Weg B gewählt, den Quest-Pfad, und ihn „im Hinblick auf das gesamte System“
> gewollt. Freigegeben („passt so“) mit dem Zusatz: erst auswählen, was man als Benutzer braucht. Grundsatz seit demselben Tag: jeder Ablauf nutzergeführt, Gestaltung mit Gamification.

## Worum es geht

Das Tool wird für den Streamer zu einem Spiel, das ihn durch die Einrichtung und die ersten
Streams führt. Es gibt **Quests** („Leg deine erste Belohnung an“), **Erfahrungspunkte (EP)**,
eine **Stufe** und **Abzeichen**. Jeder Ablauf, der etwas anlegt, wird ein **Quest-Pfad**: ein
Schritt nach dem anderen, mit Etappen, Vorschau und einem Abschluss, der gefeiert wird.

Zuschauer sehen davon nichts. Es ist die Spiel-Ebene des Streamers über seinem Werkzeug.

## Entscheidungen

- **Erst wählen, was man braucht** (Nils, beim Freigeben): Die erste Quest ist immer „Wähle, was
  dein Stream können soll“ – die Auswahl aus „Was dein Stream kann“. Bis sie geschafft ist, zeigt
  der Bereich nur sie; danach erscheinen genau die Quests der gewählten Funktionen. Wer die
  Auswahl später ändert, bekommt die Quests neuer Funktionen dazu, die der abgewählten
  verschwinden (geschaffte bleiben im Verlauf, zählen aber nicht mehr zur Stufe).
- **Erledigt ist, was der Zustand sagt.** Eine Quest gilt als geschafft, wenn der Server es am
  echten Zustand sieht (eine Belohnung existiert, OBS war verbunden, ein Moment ist
  veröffentlicht) – nicht, weil ein bestimmter Knopf gedrückt wurde. So zählt auch, was jemand
  auf einem anderen Weg oder vor den Quests schon eingerichtet hat.
- **Einmal geschafft, bleibt geschafft.** Der Zeitpunkt wird gespeichert; wer die Belohnung
  später löscht, verliert keine EP.
- **Nur Quests eingeschalteter Funktionen.** Ist eine Funktion in „Was dein Stream kann“ aus,
  sind ihre Quests ausgeblendet und zählen nicht zur nächsten Stufe. Die persönlichen Funktionen
  (Welt) haben Quests nur dort, wo der Worldbuilder eingerichtet ist.
- **Kein Abfragen.** Geprüft wird bei den Ereignissen, die etwas ändern können (ein Broadcast
  wie `progress-*`, `reward-redeemed`, `obs-status`, und nach den Routen, die anlegen), gebündelt
  auf höchstens einmal je zwei Sekunden, und beim Abruf. Das Prüfen sind ein paar `COUNT`-Abfragen.
  Passt zur Leistungsrunde vom selben Tag.
- **Stufen ohne Personen.** Stufennamen sind Dinge, keine Personen: Funke · Lagerfeuer ·
  Leuchtfeuer · Leuchtturm · Sternbild (später erweiterbar). Keine Geschlechterformen.
- **Feiern, nicht stören.** Eine geschaffte Quest zeigt einen kurzen Hinweis unten rechts mit „+EP“
  und dem Abzeichen; ein Stufenaufstieg einmal groß. Während der Stream läuft (OBS sendet),
  werden Feiern still: nur der Hinweis, kein Effekt.

## Was der Streamer sieht

- **In der Leiste links**, unter dem Logo: die Stufe als kleiner Ring mit EP-Balken. Ein Klick
  öffnet die Quests.
- **Neuer Bereich „Quests“** (zwischen „Nach dem Stream“ und „Einstellungen“): oben Stufe und
  EP, darunter die Quests in drei Gruppen – **Als Nächstes** (die eine, die das Tool vorschlägt),
  **Offen**, **Geschafft** (mit Datum). Jede offene Quest hat „Los geht's“: sie öffnet den
  passenden Quest-Pfad oder springt an die Stelle in der App.
- **Abzeichen**: je Gruppe von Quests eines, z. B. „Gastgeber“ (erste Belohnung), „Stimme des
  Chats“ (fünf Befehle), „Im Bild“ (erstes Overlay in OBS).

## Quest-Pfade (die geführten Abläufe)

Ein gemeinsamer Baustein `QuestPath` in der App: Etappen als Punkte auf einem Pfad, darunter
der Inhalt der aktuellen Etappe, unten Zurück/Weiter, am Ende der Abschluss mit EP und „Jetzt
testen“, wo es etwas zu testen gibt. Große Auswahlkarten statt Listenfeldern, Vorschläge statt
leerer Felder, eine Vorschau dessen, was entsteht.

Die Abläufe, die Quest-Pfade werden – in dieser Reihenfolge:

1. Punkte-Belohnung anlegen (Wirkung · Name & Preis · Vorschau · Geschafft)
2. Kanalpunkte-Belohnung anlegen (dieselben Etappen, mit Twitch-Prüfung vorab)
3. Befehl anlegen (Art: eigener Text oder Nachschlagen · Name · Antwort · Ausprobieren)
4. Bestenliste anlegen (Belohnung wählen · Name · Overlay ins Bild)
5. Overlay in OBS einrichten (Overlay · Szene · Prüfen, ob es im Bild ist)
6. Die Einrichtung beim ersten Start wird selbst ein Quest-Pfad.

Die bisherigen Dialoge bleiben zum **Bearbeiten**; neu angelegt wird über den Pfad.

## Quests (erste Fassung)

| Gruppe | Quest | EP | Geschafft, wenn |
|---|---|---|---|
| Start | Wähle, was dein Stream können soll | 20 | die Auswahl ist gespeichert (`features` gesetzt oder Einrichtung abgeschlossen) |
| Start | Twitch verbinden | 40 | der Bot war einmal verbunden |
| Start | OBS verbinden | 40 | OBS war einmal verbunden |
| Start | Erstes Overlay ins Bild | 40 | ein eigenes Overlay liegt in einer Szene |
| Start | Erster Stream mit dem Tool | 60 | OBS hat einmal gesendet |
| Befehle | Ersten eigenen Befehl anlegen | 30 | ein Text-Befehl existiert |
| Befehle | Fünf Befehle | 50 | fünf Text- oder Nachschlage-Befehle |
| Punkte | Erste Belohnung anlegen | 50 | eine Punkte-Belohnung existiert |
| Punkte | Belohnung selbst testen | 30 | der eigene Kanal hat einmal eingelöst |
| Punkte | 10 Einlösungen | 100 | zehn Einlösungen mit Punkten |
| Kanalpunkte | Erste Belohnung aus dem Tool | 50 | eine Twitch-Belohnung mit Aktion existiert |
| Bestenliste | Erste Bestenliste | 40 | eine Bestenliste existiert |
| Glücksrad | Drei Themen sammeln | 30 | drei offene Themen |
| Glücksrad | Rad gedreht | 30 | einmal gedreht |
| Alerts | Eigener Ton | 30 | ein Alert hat einen Ton |
| Momente | Ersten Moment merken | 30 | ein Moment existiert |
| Momente | Moment veröffentlicht | 60 | ein Moment steht auf „Veröffentlicht“ |
| Discord | Live-Meldung einrichten | 40 | ein Webhook ist gespeichert |
| Welt (persönlich) | Eintragskarte im Bild | 40 | das Overlay `character` liegt in einer Szene |

Stufen: 0 · 100 · 250 · 450 · 700 EP (Funke bis Sternbild). Die Liste wächst mit den Funktionen;
eine Quest ist ein Eintrag mit Schlüssel, Gruppe, Funktion, EP und einer Prüffunktion.

## Datenmodell

`quest_progress` (Schema v31): `key` (PRIMARY KEY), `completed_at`. Dazu für „war einmal“-Quests
(Twitch, OBS, Stream, Rad gedreht, eigene Einlösung) je ein Merker in `settings`, den die Stelle
setzt, an der es passiert – billig, und der Zustand allein könnte es später nicht mehr zeigen.

## Server

- `src/server/quests/catalog.ts` – die Quests mit Prüffunktionen; `src/server/quests/index.ts` –
  `evaluateQuests()` (prüft offene, speichert neu geschaffte, broadcastet `quest-completed`),
  `questOverview()` (Stufe, EP, Gruppen).
- `GET /api/quests` – Übersicht. Kein Schreiben von außen: geschafft wird nur über den Zustand.
- Auslöser: `onBroadcast` für die betreffenden Ereignisse, gebündelt (2 s); dazu einmal beim Start.

## Tests (HTTP-Naht)

Übersicht leer; eine Belohnung anlegen → Quest geschafft, EP und Stufe stimmen; löschen →
bleibt geschafft; Funktion aus → Quest ausgeblendet und nicht gezählt; persönliche Quests nur
mit Worldbuilder; „war einmal“-Merker.

## Stufen der Umsetzung

1. Server: Katalog, Prüfung, Speicher, `/api/quests`, Auslöser. Tests.
2. App: Stufe in der Leiste, Bereich „Quests“, Hinweis bei geschaffter Quest.
3. `QuestPath` und die Punkte- und Kanalpunkte-Belohnung als erste Pfade.
4. Befehl, Bestenliste, Overlay in OBS als Pfade.
5. Die Einrichtung beim ersten Start als Quest-Pfad – mit der Auswahl als erster Etappe.

## Nicht Teil davon

Quests für Zuschauer, Ranglisten zwischen Streamern, Belohnungen außerhalb des Tools.
