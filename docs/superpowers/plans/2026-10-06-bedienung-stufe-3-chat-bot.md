# Bedienung neu aufbauen — Stufe 3: Chat & Bot — Implementation Plan

> Gebaut am 06.10.2026 nach Stufe 4. Kurz gehalten, weil die Bausteine (Dialog, Karten-Stile, Filter-Pillen) aus Stufe 4 schon da waren.

**Goal:** Unter „Chat & Bot → Befehle“ steht eine Liste für alles, was Nils pflegt – eigene Texte und Nachschlage-Befehle –, mit Filter „Aktiv / Ausgeschaltet“. Eine Zeile zeigt Stern (steht in `!befehle` vorn), Name, den Satz für Zuschauer, Zweitnamen, Zeichenzahl bzw. Art, „Bearbeiten“ und „Ausschalten“. Bearbeiten öffnet einen Dialog mit Name, Antwort (mit Vorschau, wie viele Chat-Nachrichten es werden), Satz, Zweitnamen und Pause in einem. Die heutige Dreiteilung – Textliste, „Übersicht für Zuschauer“, Zweitnamen-Block – ist damit aufgehoben. Eingebaute Befehle stehen nicht in der Liste (06.10.); ihre Namen und ihre Pause liegen unter „Von selbst“. „Ausprobieren“ ist ein eigener Unterreiter.

**Architecture:** Keine Server-Änderung. Die Liste vereint drei Antworten des Servers: `/text-commands`, `/lookup-commands` (Inhalt, Pause, an/aus) und `/commands` (Satz je Befehl – gespeichert oder vom Tool hergeleitet –, Zweitnamen, Stern). Speichern geht über die bestehenden Routen: `POST/PATCH /text-commands`, `POST/PATCH /lookup-commands` (jeweils mit `description`), `POST /commands/aliases` (die ganze Karte Zweitname → Befehl, mit den Einträgen dieses Befehls ersetzt), `POST /commands/featured`. Ausprobieren: `POST /chat/try` mit `as: 'viewer'`.

**Spec:** `docs/superpowers/specs/2026-10-05-bedienung-neuaufbau-design.md`, Abschnitt „Chat & Bot → Befehle“.

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/renderer/src/panels/TextCommandsPanel.tsx` | **Neu geschrieben.** Die Liste mit Filter, Gruppen, Zeilen, Dialog „Befehl bearbeiten“ / „Neuer Befehl“ (mit Wahl „Eigener Text“ / „Aus der Welt nachschlagen“), Twitch-Panel-Text (Kopieren, Ansehen). |
| `src/renderer/src/panels/TryCommandsPanel.tsx` | **Neu.** Unterreiter „Ausprobieren“: Eingabe, „Ausprobieren“, Haken „Wie ein Zuschauer ohne Mod-Rechte“, Antwort-Blasen oder der Grund, warum keine kommt. |
| `src/renderer/src/components/CommandOverview.tsx`, `components/ChatCommands.tsx` | **Gelöscht.** Aufgegangen in der Liste bzw. in den Karten-Sätzen. |
| `panelKeys.ts`, `navigation.ts`, `panelRegistry.tsx` | **Ändern.** Schlüssel `trycommands`, Unterreiter „Ausprobieren“. |
| `src/renderer/src/index.css` | **Ändern.** `.cmd-*`, `.filter-pills`, `.pill`, `.chip`, `.dialog-grid`. |

## Tasks

- [x] Liste: Filter-Pillen mit Zählung, Gruppen „Eigene Texte“ und „Aus der Welt nachschlagen“, leere Gruppen fallen weg, Leerzustand mit Vorschlägen (`!story`, `!welt`, `!stream`, `!zeitplan`).
- [x] Zeile: Stern (an/aus, höchstens fünf – der Server zählt), Name, Satz (hergeleitete Sätze kursiv), „· auch !socials“, Zeichenzahl gegen 500 bzw. „sucht unter „Figur““ oder „Art „X“ fehlt in der offenen Welt“, „Bearbeiten“, „Ausschalten“/„Einschalten“.
- [x] Dialog: Name, Pause (Auswahlliste), Antwort mit Vorschau (`/text-commands/preview`) bzw. Art (Auswahlliste der offenen Welt), Satz für Zuschauer (Platzhalter = hergeleiteter Satz), Zweitnamen als Chips mit „Entfernen“ und Feld „Hinzufügen“, „Löschen“, „Abbrechen“, „Speichern“. Umbenennen zieht die Zweitnamen mit.
- [x] Twitch-Panel: „Text fürs Twitch-Panel kopieren“ und „Ansehen“ (Dialog mit dem Text).
- [x] „Ausprobieren“ als Unterreiter mit eigenem Panel.
- [x] Hinweis, wenn der Worldbuilder nicht erreichbar ist (Nachschlage-Befehle finden gerade nichts; Arten kommen, sobald er läuft).
- [x] Typecheck, Tests, Lint; Durchlauf: 22 Panels; Liste, Dialog und Ausprobieren in Chrome fotografiert.
- [ ] Mit laufendem Worldbuilder prüfen: Arten in der Auswahlliste, Nachschlage-Befehl anlegen, `!figur <Name>` ausprobieren.

## Bewusst nicht in dieser Stufe

Die Sätze der eingebauten Befehle (für `!befehle` und den Twitch-Panel-Text) lassen sich in der Oberfläche nicht mehr umformulieren – die Standardsätze schreibt das Tool, Nils hat die Gruppe „Eingebaut“ bewusst gestrichen. Die Schnittstelle `POST /commands/descriptions` bleibt.
