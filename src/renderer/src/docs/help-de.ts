// Documentation content (German)

export const HELP_SECTIONS_DE = [
  {
    title: 'Erste Schritte',
    content: `Das Stream Toolkit ist deine Zentrale für Streaming. Hier steuerst du alles — Overlays, Challenges, Clips, Aufgaben, Milestones und mehr.

Links stehen die Bereiche nach Situation: **Im Stream** (alles, was du live auslöst), **Chat & Bot**, **Overlays & Alerts**, **Nach dem Stream**, darunter **Einstellungen** und **Hilfe**. Unten in der Leiste siehst du immer, ob Twitch, OBS und der Worldbuilder verbunden sind. Fehlt vor dem Stream etwas, steht es oben auf „Im Stream“ in einem Balken – mit dem, was es im Stream bedeutet, und einem Knopf, der dich hinbringt. Alle Verbindungen richtest du unter **Einstellungen → Verbindungen** ein — Twitch, OBS, Notion, Discord; den Stream-Deck-Token findest du unter **Einstellungen → Daten**.

**Voraussetzungen:**
- OBS Studio (Version 28+) mit aktiviertem WebSocket Server
- Twitch-Account mit einer App auf dev.twitch.tv
- Optional: Notion-Account für Clip-Sync
- Optional: Elgato Stream Deck`,
  },
  {
    title: 'Einrichtung: Was dein Stream kann',
    content: `Beim ersten Start fragt das Tool **„Was soll dein Stream können?“** – sechzehn Funktionen in vier Gruppen (Im Chat, Overlays, Mit Kanalpunkten, Nach dem Stream), jede mit einem Satz und dem Hinweis, was sie braucht. Danach **Verbinden** (nur Twitch, OBS, Discord – was die Auswahl braucht), **In OBS einrichten** (das Tool legt die Browserquellen an, du wählst die Szene) und **Fertig** (was steht, was fehlt, welche Belohnungen in Twitch anzulegen sind).

- Jeder Schritt lässt sich überspringen. Wer die Einrichtung überspringt, sieht die ganze App.
- Die Auswahl **blendet aus, sie löscht nicht**: Karten auf „Im Stream“, Overlays in der Liste, Unterreiter, eingebaute Befehle, Tastenkürzel und Prüfpunkte im Balken richten sich danach. Der Bot antwortet auf einen ausgeschalteten Befehl nicht, und \`!befehle\` nennt ihn nicht.
- Ändern: **Einstellungen → Programm → Was dein Stream kann → Ändern** öffnet die Einrichtung noch einmal, mit dem, was schon steht.
- Die Gruppe **Welt** (Eintragskarte, Start-, Pausen- und Endbild) erscheint nur auf einem Rechner, auf dem der Worldbuilder eingerichtet ist.`,
  },
  {
    title: 'Wo finde ich was',
    content: `Die Oberfläche ist nach Situation sortiert, nicht nach Technik. Links die Bereiche, oben auf einer Seite die Themen.

| Früher | Jetzt |
|--------|-------|
| Live → Challenge | Im Stream → Ziel für heute |
| Live → Glücksrad, Abstimmungen, Now Playing | Im Stream → Glücksrad, Abstimmung, Musik |
| Projekt → Progress Tracker | Im Stream → Fortschritt |
| Projekt → Welt | Im Stream → Eintrag aus der Welt |
| Projekt → Erklär-Commands | Chat & Bot → Befehle |
| Settings → Features → Chat Commands | Chat & Bot → Von selbst |
| Settings → Overlays | Overlays & Alerts → Overlays |
| Settings → Features → Alerts | Overlays & Alerts → Alerts |
| Settings → Milestones | Overlays & Alerts → Meilensteine |
| Live → OBS Scenes | Overlays & Alerts → Szenen in OBS |
| Produktion → Clip Moments | Nach dem Stream → Content planen |
| Settings → Features → Auto-Clips | Nach dem Stream → Content planen → Von selbst merken |
| Projekt → Statistiken | Nach dem Stream → Statistik |
| Live → Reward Stats | Nach dem Stream → Kanalpunkte |
| Settings → Verbindungen / App / Daten & API | Einstellungen → Verbindungen / Programm / Daten |
| Hotkeys | Einstellungen → Programm → Tastenkürzel |

Die Kästen lassen sich nicht mehr verschieben, anpinnen oder ausblenden — jedes Panel hat genau einen Ort. Welcher Bereich und welches Thema zuletzt offen waren, merkt sich das Tool.

Auf „Im Stream“ steht an jeder Karte, ob ihr Overlay in der laufenden OBS-Szene an ist („in der Szene“ / „nicht in der Szene“) — sobald OBS verbunden ist; oben rechts der Name der Szene. „Moment merken“ setzt dort eine Marke für später (Nach dem Stream → Content planen).`,
  },
  {
    title: 'Daten: was gespeichert wird, was den Rechner verlässt',
    content: `Alles liegt in einer Datenbank auf deinem Rechner. Das Tool hat keinen eigenen Server, keine Telemetrie, keine Werbe-IDs. Die einzige Verbindung nach draußen, die es von sich aus aufbaut, ist die Update-Prüfung bei GitHub – ohne Daten von dir.

**Über Zuschauer gespeichert:** der Twitch-Login mit der Zahl seiner Einlösungen je Bestenliste, Songwünsche, Themen und Vorschläge, dazu Namen in Moment-Notizen aus der Hype-Erkennung. Es gibt kein Protokoll, wer wann was eingelöst oder eingetippt hat. Chatzeilen bleiben nur im Speicher und sind nach dem Neustart weg.

**Wie lange:** Erledigte Songwünsche löscht das Tool nach 90 Tagen von selbst. Wer ein Jahr nicht geflext hat, verschwindet aus der Bestenliste. Unter **Nach dem Stream → Kanalpunkte → Bearbeiten → Zuschauer vergessen** verschwindet alles, was unter einem Namen gespeichert ist, sofort.

**Was den Rechner verlässt – nur wenn du es anschließt:**
- **Notion:** Moment-Notizen mit Schlagwort, Zeitmarke und Text, also auch Zuschauernamen aus der Hype-Erkennung. Notion ist ein US-Anbieter.
- **Discord:** nur die Live-Meldung mit deinem Kanalnamen. Keine Zuschauerdaten.
- **Sync-Ordner:** die ganze Datenbank, also auch alle Zuschauerdaten – ohne Zugangsdaten. Liegt der Ordner in Dropbox oder iCloud, liegt sie dort.
- **Sicherung:** dieselbe Datenbank als Datei, ohne Zugangsdaten. Du entscheidest, wo sie hinkommt.
- **Twitch:** der Bot liest und schreibt in deinem Kanal; Einlösungen kommen von Twitch. Die Anmeldung läuft über die App-Registrierung des Tool-Autors.

**Was Zuschauer erfahren:** \`!datenschutz\` antwortet im Chat mit einem Satz, der genau das sagt – Daten, Fristen, Löschen auf Wunsch. Derselbe Satz steht im Text fürs Kanal-Panel (Chat & Bot → Befehle → Panel-Text). Ein Twitch-Login ist ein Pseudonym, aber personenbezogen; wer öffentlich streamt, ist für sein Tool verantwortlich und sagt den Zuschauern am besten, was es tut.`,
  },
  {
    title: 'Content planen',
    content: `Aus Momenten wird Content. Jeder Moment, den du im Stream mit „Moment merken“, am Stream Deck oder per Tastenkürzel setzt, landet unter **Nach dem Stream → Content planen** in der Spalte **Neu**. Von dort schiebst du ihn weiter: **Geplant** (du weißt, wohin und wann), **Geschnitten** (der Clip ist fertig), **Veröffentlicht**.

- Eine Karte anklicken öffnet den Dialog: Schritt, Plattformen (TikTok, Shorts, Reels, Discord, Twitch-Clip), Termin, Titel oder Hook, Schlagwort, Notiz. Ziehen in eine andere Spalte geht auch.
- Was das Tool von selbst gemerkt hat (Kanalpunkte, Meilensteine, Hype), steht in Neu mit „Behalten“ oder „Verwerfen“.
- **+ Idee** legt Content an, der nicht aus einem Stream-Moment kommt.
- Veröffentlichtes bleibt 30 Tage auf dem Brett und wandert dann ins Archiv („Archiv anzeigen“). Nichts wird dabei gelöscht.
- Unten: einen Stream-Tag als CSV für DaVinci Resolve exportieren oder nach Notion schicken; die Notion-Übergabe von selbst lässt sich dort an- und ausschalten.`,
  },
  {
    title: 'Twitch verbinden',
    content: `**1. Twitch App erstellen:**
- Gehe auf dev.twitch.tv → Applications → Register Your Application
- Name: beliebig (z.B. "Stream Toolkit")
- OAuth Redirect URL: http://localhost:4000/auth/twitch/callback
- Category: Chat Bot
- Client-ID kopieren

**2. Im Toolkit verbinden:**
- Einstellungen → Verbindungen → Twitch → Client-ID eintragen
- "Mit Twitch verbinden" klicken → Twitch-Login im Browser
- Nach dem Login verbindet sich der Bot automatisch

**Chat-Commands:**
| Command | Beschreibung |
|---------|-------------|
| !befehle | Nennt die wichtigsten Befehle (die mit ★ in der Übersicht). „!befehle alle“ listet jeden, „!befehle welt / texte / stream“ eine Gruppe |
| !befehle <Name> | Erklärt einen einzelnen Befehl, z. B. !befehle figur |
| !commands / !help | Dasselbe wie !befehle — für alle, die auf Englisch suchen |
| !so <Name> | Nur Mods: empfiehlt einen Kanal mit seiner letzten Kategorie. Nach einem Raid schreibt der Bot das selbst (Chat & Bot → Von selbst → Shoutout nach einem Raid) |
| !challenge | Zeigt aktuelle Challenge |
| !figur | Zeigt die Figur, die gerade im Overlay ist |
| !figur <Name> | Schlägt eine Figur in der Welt nach |
| !ort / !gilde / !begriff <Name> | Schlagen Orte, Gilden und Begriffe nach (einstellbar) |
| !song | Zeigt aktuellen Song |
| !sr <URL> | Wünscht einen Song (YouTube oder Spotify) |
| !queue | Zeigt die nächsten Song-Wünsche |
| !hype | Löst einen Hype Moment aus |
| !themen (auch !issues) | Zeigt offene Einträge |
| !todo | Zeigt offene Aufgaben |
| !progress | Zeigt Projekt-Fortschritt |
| !stats [name] | Zeigt eingelöste Rewards |
| !vote <option> | Stimme bei Abstimmung ab |
| !design start/end/status | Chat-Abstimmung |
| !scene | Listet OBS-Szenen (nur Mods) |
| !scene <name> | Wechselt OBS-Szene (nur Mods) |
| !uptime | Zeigt Stream-Laufzeit |
| !stats [Name] | Stand in jeder Bestenliste |
| !datenschutz (auch !privacy) | Sagt, was das Tool über Zuschauer speichert, wie lange, und dass es auf Wunsch gelöscht wird |

Alle Befehle lassen sich unter Chat & Bot → Von selbst umbenennen. Antworten, die länger als eine Chat-Nachricht (500 Zeichen) sind, verteilt der Bot automatisch auf mehrere Nachrichten.`,
  },
  {
    title: 'Erklär-Commands',
    content: `Erklär-Commands sind Chat-Befehle, deren Antwort du selbst schreibst — für alles, was du sonst in jedem Stream neu erklärst: Worum geht die Story? Wo spielt sie? Was passiert hier?

**Anlegen:** Chat & Bot → Befehle → „+ Neuer Befehl“. Im Dialog stehen Name, Antwort, der Satz für Zuschauer, Zweitnamen und die Pause beisammen; der Stern an einer Zeile nennt den Befehl in „!befehle“ vorn. Unter „Ausprobieren“ siehst du die Antwort, ohne live zu sein.
- **Befehl:** ein Wort, z. B. !story. Das ! kannst du weglassen.
- **Text:** was der Chat lesen soll. Darunter siehst du, in wie viele Chat-Nachrichten er aufgeteilt wird — höchstens 3.
- **Cooldown:** so viele Sekunden antwortet der Befehl nach einer Antwort nicht noch einmal. Mods und du selbst sind davon ausgenommen und starten ihn auch nicht.

**Ausprobieren:** Unten im Panel einen Befehl eintippen, z. B. !befehle — du siehst die Antwort, ohne live zu sein. Getestet wird als Broadcaster, der Cooldown startet also nicht.

**Regeln:**
- Ein Erklär-Command darf nicht heißen wie ein eingebauter Befehl — auch nicht wie ein umbenannter.
- Ausgeschaltete Befehle antworten nicht und stehen nicht in !befehle.
- !befehle nennt nur die wichtigsten Befehle — welche, wählst du in der Übersicht mit ★ (bis zu sechs). „!befehle alle“ listet jeden, „!befehle welt“, „!befehle texte“ und „!befehle stream“ je eine Gruppe. Mit einem Namen dahinter (!befehle figur) kommt der eine Satz zu diesem Befehl.
- **Zweitnamen:** In der Übersicht kannst du einem Befehl weitere Namen geben (!socials für !links); sie antworten wie der Befehl selbst und stehen in Listen dahinter („auch !socials“). !issues ist so ein fester Zweitname von !themen.
- **Schlaue Cooldowns:** Jeder Cooldown gilt für einen ruhigen Chat. Ab 20 Nachrichten pro Minute halbiert er sich, ab 60 ist es ein Viertel — in einem vollen Chat ist die Antwort schnell weggescrollt. Wer die Antwort gerade bekommen hat, bekommt sie frühestens nach dem Vierfachen (mindestens einer Minute) wieder; andere nach dem normalen Cooldown. Die eingebauten Befehle, die nur etwas sagen (!song, !uptime, !progress …), teilen sich einen Cooldown (Chat & Bot → Von selbst → Pause zwischen Antworten, Standard 15 s). !vote, !sr und !hype haben keinen. Mods und du warten nie.
- **Erinnerung:** Unter Chat & Bot → Von selbst → Erinnerung sagt der Bot alle paar Minuten einen Satz von selbst („Neu hier? !welt erklärt die Welt …“) — aber nur, wenn seit dem letzten Mal jemand im Chat geschrieben hat.

**Übersicht für Zuschauer:** Unten im Panel steht jeder Befehl mit einem Satz. Lässt du das Feld leer, schreibt das Tool den Satz selbst — bei eigenen Texten der erste Satz der Antwort, beim Nachschlagen die Art, bei eingebauten ein fester Text; er steht blass im Feld. **Für Twitch-Panel kopieren** legt die ganze Liste als Text in die Zwischenablage, den du auf Twitch unter *Kanal bearbeiten → Panels* einfügst. Nach Änderungen musst du ihn dort neu einfügen.
- Eigene Texte und Nachschlage-Commands sind im Backup enthalten.

**Aus der Welt nachschlagen:** Nachschlage-Commands suchen live in deiner Worldbuilder-Welt. Zuschauer schreiben z. B. !figur Mila oder !ort Saldor und bekommen Titel, Rolle und Kurzbeschreibung (oder den Text) in einer Chat-Nachricht.
- **Voreingestellt:** !figur → Figur, !ort → Ort, !gilde → Fraktion, !begriff → Konzept. Heißt eine Art in deiner Welt anders (z. B. „Region“ statt „Ort“), wählst du sie im Panel aus. Ein ⚠️ markiert Arten, die es in der offenen Welt nicht gibt.
- **Eigene dazu:** unten im Abschnitt einen Befehl und eine Art wählen, z. B. !fähigkeit → Fähigkeit.
- **Suche:** in Titel und Zweitnamen, ohne auf Groß-/Kleinschreibung oder Akzente zu achten. Ein Teil des Namens reicht („silberzunge“). Ein genauer Treffer schlägt Namen, die ihn nur enthalten.
- **Mehrere Treffer** nennt der Bot. **Kein Treffer:** „Kenne ich (noch) nicht“ — was der Zuschauer getippt hat, wiederholt der Bot nie.
- **Ohne Namen:** !figur zeigt die Figur im Overlay; ist keine drin, und bei allen anderen Befehlen, listet der Bot die Einträge der Art.
- **Verworfen** markierte Einträge findet niemand.
- **Cooldown pro Name:** !figur Mila und !figur Selma bremsen sich nicht gegenseitig.
- **Voraussetzung:** Der Worldbuilder läuft und das Schaufenster ist offen (Worldbuilder → Verwalten → Schaufenster öffnen).`,
  },
  {
    title: 'Welt & Eintragskarte',
    content: `Die Eintragskarte zeigt im Stream, woran du gerade arbeitest — eine Figur, einen Ort, eine Gilde, einen Begriff — als Seite aus dem Kompendium deiner Welt.

**In OBS:** Browser-Quelle mit http://localhost:4000/overlay/character/index.html (dieselbe URL wie früher das Figuren-Overlay), etwa 800 × 700 groß.

**Wo:** Im Stream → Eintrag aus der Welt
- **Quelle:** Worldbuilder oder Notion. Notion kennt nur Figuren.
- **Reiter:** eine Art pro Reiter, mit ihrer Farbe aus dem Worldbuilder. Darunter die Suche.
- **▶** bringt einen Eintrag sofort ins Overlay. **✕ Overlay leeren** blendet die Karte aus.
- **Klick auf einen Eintrag** zeigt alles, was auf der Karte landen könnte — jedes mit einem Schalter.

**Spoiler ausblenden:** 👁 heißt „im Stream zu sehen“, 🙈 heißt „ausgeblendet“.
- Gilt pro Eintrag und Feld: Samaels Kurzbeschreibung ausblenden lässt die von Mila unberührt.
- Auch Text, Zweitnamen und Bild lassen sich ausblenden.
- Ausgeblendetes erscheint weder auf der Karte noch in Chat-Antworten (!figur Samael).
- Wirkt sofort, auch wenn die Karte gerade zu sehen ist. Ist die Kurzbeschreibung aus, rückt der Text nach, wenn er an ist.
- Die Schalter bleiben gespeichert und sind im Backup enthalten.

**Worldbuilder folgen:** Die Karte wechselt von selbst zu dem Eintrag, den du im Worldbuilder öffnest — auf der Karte zählt der Eintrag hinter der gewählten Markierung.
- Erst wenn ein Eintrag die Wartezeit lang offen bleibt (Standard 1 s), springt die Karte um. Durch eine Liste klicken flackert nicht.
- Ist nichts mehr offen, bleibt die letzte Karte stehen. Ebenso, wenn der offene Eintrag **Verworfen** ist — der kommt nie auf die Karte und steht auch nicht in der Liste im Panel.
- **Festpinnen:** Wählst du im Panel einen Eintrag (▶) oder leerst das Overlay, bleibt die Karte stehen, egal was im Worldbuilder offen ist. „Wieder folgen“ — oder der Stream-Deck-Knopf „Karte festpinnen“ — lässt sie wieder folgen, und sie springt sofort zum offenen Eintrag.
- Funktioniert nur mit Worldbuilder als Quelle. Der Worldbuilder muss das Schaufenster offen haben.

**Was die Karte zeigt:** Titel, Zweitname und Rolle, die Kurzbeschreibung (sonst den Text), weitere Felder und Beziehungen („Gehört zu: Die Goldene Hand“), den Namen der Welt und den Reifegrad.

**Damit sie immer in ihre Quelle passt,** auch bei langen Einträgen: Der Titel hat höchstens zwei Zeilen und wird kleiner, wenn er länger ist; Zweitname und Rolle eine Zeile; die Beschreibung höchstens vier Zeilen; Felder und Beziehungen zusammen höchstens drei, jede einzeilig — hat der Eintrag Beziehungen, ist mindestens eine davon dabei. Was darüber hinausgeht, endet mit „…“. Den ganzen Text gibt es mit !figur im Chat. Beziehungen zu verworfenen Einträgen erscheinen nicht. Jede Beziehung hat im Panel ihren eigenen 👁-Schalter (↔).

**Umgestalten:** Farben und Schriften kommen aus Overlays & Alerts → Aussehen und gelten für alle Overlays zugleich; einzelne lassen sich dort übersteuern. Die Karte selbst nutzt den Kompendium-Stil aus /overlay/lexikon.css — dort liegen auch die drei Gewichte (voll, schlank, flüchtig), die alle Overlays teilen. Nur was dieser Karte allein gehört (Breite, das Wort „Kompendium“ über dem Titel) steht oben in ihrer Datei. Über Overlays & Alerts → Overlays → „HTML bearbeiten“ lässt sich eine eigene Fassung anlegen.`,
  },
  {
    title: 'Discord: Live-Meldung',
    content: `Wenn du in OBS den Stream startest, schreibt das Toolkit eine Nachricht in einen Discord-Channel — etwa „Jetzt live!“ mit dem Link zu deinem Twitch-Kanal.

**Einrichten:**
- In Discord: Channel bearbeiten → Integrationen → Webhooks → Neuer Webhook → Webhook-URL kopieren
- Einstellungen → Verbindungen → Discord — Live-Meldung → URL einfügen, Text anpassen, Speichern
- {channel} im Text wird zu deinem Twitch-Kanal

**Gut zu wissen:**
- Gemeldet wird nur ein echter Start in OBS. Bricht der Stream ab und startet innerhalb von 30 Minuten neu, kommt keine zweite Meldung — auch nicht, wenn das Toolkit mitten im Stream neu startet.
- @everyone pingt die Meldung nie. Eine Rolle (etwa „Stream-Ping“) kannst du mit <@&Rollen-ID> im Text anpingen.
- Die Webhook-URL ist ein Schreibrecht für den Channel. Sie wird nach dem Speichern nicht mehr angezeigt.`,
  },
  {
    title: 'OBS verbinden',
    content: `**In OBS:**
- Tools → WebSocket Server Settings
- "Enable WebSocket Server" aktivieren
- Port: 4455 (Standard)
- Passwort: setzen oder Authentication deaktivieren

**Im Toolkit:**
- Einstellungen → Verbindungen → OBS → Host, Port, Passwort eintragen
- "Mit OBS verbinden" klicken

**Start, Pause, Ende:**
- Im OBS-Panel legt **Szenen anlegen** je eine Szene für das Startbild („start“), das Pausenbild („brb“) und das Endbild („end“) an — mit dem ganzseitigen Overlay als Browser-Quelle (startScreen, pauseScreen, endScreen).
- Gibt es eine der drei schon, werden die neuen wie sie aufgebaut: dieselben Quellen (Chat, Musik …) an denselben Stellen, nur das Bild getauscht. Wer die Pausen-Szene eingerichtet hat, bekommt Start und Ende also passend dazu.
- Was es schon gibt, bleibt unberührt: Eine Szene, die das Bild schon zeigt, wird erkannt, egal wie sie heißt. Eine Szene, die nur so heißt und etwas anderes zeigt, wird nicht angefasst. Ein zweiter Klick ändert nichts.
- Die Hinweise auf den Bildern (!welt, !story, !discord) und der Kanalname stehen fest im Overlay — anpassen über Overlays & Alerts → Overlays → „HTML bearbeiten“.

**Scene-Switching via Chat:**
- Mods/Broadcaster: !scene <Szenenname> im Chat
- Viewer: über Channel-Point-Rewards (siehe "Channel Points")

**Scene-Switching via API:**
- POST /api/obs/scene mit { "scene": "Szenenname" }
- GET /api/obs/scenes listet alle Szenen`,
  },
  {
    title: 'Kanalpunkte & Bestenliste',
    content: `Belohnungen legst du in Twitch an (Creator-Dashboard → Zuschauer belohnen → Kanalpunkte). Löst jemand eine ein, meldet Twitch das dem Tool, und das Tool erkennt am Namen, was zu tun ist.

| Name enthält | Aktion |
|---|---|
| *(Belohnung einer Bestenliste)* | zählt eine Einlösung in dieser Bestenliste |
| "roulette" | Glücksrad drehen |
| "feature" | Vorschlag einreichen |
| "musik" oder "song" | Musik ändern |
| "scene" oder "szene" | Szene wechseln – nur in Szenen, die unter Szenen in OBS → Szene per Kanalpunkt stehen |

Bestenlisten legst du unter **Overlays & Alerts → Bestenlisten** an: ein Name und die Belohnung aus deinem Kanal. Die Wahl hängt an der Belohnung selbst, nicht an ihrem Namen – umbenennen in Twitch ist kein Problem. Löschst du sie in Twitch, zeigt die Liste das an, bis du eine andere wählst.

**Eine Bestenliste** zählt jede Einlösung ihrer Belohnung. Der Bot antwortet „@Name: Flex Nr. 12 – Platz 3“, das Overlay **Bestenliste** zeigt die Top 3 der Liste, **Rangwechsel** meldet Überholer, die Alert-Tafel zeigt die Einlösung. \`!stats\` zeigt den eigenen Stand in jeder Liste, \`!stats <Name>\` den eines anderen. Je Liste gibt es unter Overlays eine Bestenliste und einen Rangwechsel mit eigener Adresse.

In der Liste siehst du die Rangliste, kannst Zahlen korrigieren, Einträge von Hand setzen, die Liste umbenennen oder löschen und einen Zuschauer vergessen.

**Zuschauerdaten:** Einlösungen werden mit dem Twitch-Login gezählt, nicht protokolliert. Erledigte Songwünsche löscht das Tool nach 90 Tagen von selbst, Zuschauer ohne Einlösung seit einem Jahr fallen aus der Zählung. Sicherung und Sync-Ordner enthalten keine Zugangsdaten.

**Feste Szenen-Belohnungen:** Unter Overlays & Alerts → Szenen in OBS → Szene per Kanalpunkt ordnest du einer Belohnung eine Szene zu, mit Dauer und Rückwechsel.`,
  },
  {
    title: 'Overlays',
    content: `Overlays werden als **Browser Source** in OBS eingebunden.

**Eingebaute Overlays:**
| Overlay | URL | Beschreibung |
|---------|-----|-------------|
| Progress | /overlay/progress/index.html | Projekt-Fortschritt |
| Milestone | /overlay/milestone/index.html | Achievement-Benachrichtigungen |
| Alerts | /overlay/alerts/index.html | Follower, Abos, Geschenk-Abos, Raids, Bits, Kanalpunkte |
| Song | /overlay/song/index.html | Aktueller Song |
| Chat | /overlay/chat/index.html | Die letzten acht Chat-Nachrichten, ohne Befehle; was Mods löschen, verschwindet auch hier |
| Start | /overlay/start/index.html | Füllt den ganzen Stream davor: „Gleich geht’s los.“, der zuletzt aufgeschlagene Eintrag und der Hinweis auf !welt und !story |
| Pause | /overlay/pause/index.html | Füllt den ganzen Stream in der Pause: „Gleich zurück.“ und der zuletzt aufgeschlagene Eintrag |
| Ende | /overlay/end/index.html | Füllt den ganzen Stream zum Schluss: „Bis zum nächsten Mal.“, der zuletzt aufgeschlagene Eintrag und der Hinweis auf !discord |
| Reward Leaderboard | /overlay/reward-leaderboard/index.html | Wer die meisten Rewards eingelöst hat |
| Reward Rank Change | /overlay/reward-rankchange/index.html | Einblendung, wenn sich die Rangliste ändert |
| Todos | /overlay/todos/index.html | Todo-Liste |
| Poll | /overlay/poll/index.html | Abstimmungen |
| Roulette | /overlay/roulette/index.html | Glücksrad |
| Challenge | /overlay/challenge/index.html | Challenge-Status |
| Eintragskarte | /overlay/character/index.html | Woran gerade gearbeitet wird — Figur, Ort, Gilde, Begriff |

**In OBS einbinden:**
1. Quellen → + → Browser
2. URL: http://localhost:4000/overlay/<name>/index.html
3. Breite/Höhe anpassen
4. Fertig

**Alerts:** Das Overlay meldet neue Follower, Abos (auch Wiederholungen und Geschenke), Raids, Bits und eingelöste Kanalpunkte. Die Texte und Töne stellst du unter Overlays & Alerts → **Alerts** ein: je Anlass eine Überschrift, der Text nach dem Namen und, wenn du willst, eine Tondatei (.mp3, .wav, .ogg, bis 5 MB) mit eigener Lautstärke. Platzhalter wie {monate}, {empfaenger}, {abos}, {zuschauer} und {bits} füllt das Toolkit aus („7 Monate“, „42 Zuschauer“); mit einer Rechnung dahinter — {monate*5}, auch + - / — steht nur die gerundete Zahl da, ohne Einheit („35“), sodass du selbst benennst, was gezählt wird; mit einer Kommazahl ({monate*4.99}) bleiben zwei Nachkommastellen („34,93“); ein leeres Feld nimmt wieder den Standardtext. „Test“ speichert und zeigt den Alert im Overlay — im Stream sichtbar und hörbar. Damit der Ton im Stream ankommt, muss in OBS an der Browser-Quelle der Alerts „Audio über OBS steuern“ an sein. Die Texte für Kanalpunkte stehen fest. Was ein Zuschauer beim Abo oder bei den Bits dazuschreibt, steht darunter in Anführungszeichen. Jede Meldung ist eine Kompendium-Tafel oben rechts, in drei Größen: Follower klein (5 s), Abos, Geschenke und Bits etwas größer (6 s), ein Raid breit mit großem Namen (9 s). Kommen mehrere zugleich, erscheinen sie nacheinander; fünf verschenkte Abos sind eine Meldung, nicht sechs. **Abos, Geschenke, Raids und Bits kommen über den Chat** und brauchen keine zusätzlichen Rechte. **Neue Follower brauchen ein Recht mehr** (moderator:read:followers): Verbinde dich in Einstellungen → Verbindungen einmal neu mit Twitch, sonst bleiben Follower-Meldungen aus. Ob es geklappt hat, steht im Log — „Subscribed to follows“ oder ein Hinweis, dass Twitch die Anmeldung abgelehnt hat.

**Showcase:** Über den eingebauten Overlays öffnet **🖼️ Showcase** jedes Overlay in jedem Zustand mit Testdaten — zum Ansehen und Gestalten, ohne dass etwas in OBS erscheint. Die Seite hält jeden Zustand an, so wie ihn das Erfassen für Figma sieht; **▶ In Bewegung** zeigt dasselbe mit laufenden Animationen und Knöpfen zum Ausprobieren: **↻ Nochmal** spielt einen Zustand von vorn — Alerts und das Glücksrad blenden sich wie im Stream nach ein paar Sekunden aus —, dazu je Overlay Aktionen wie Punkt abhaken, Rad drehen oder Song wechseln. Direkt erreichbar unter http://localhost:4000/overlay/showcase/. Wie ein Overlay in Figma gestaltet und zurückgeholt wird, steht in docs/design-workflow.md.

**Aus Figma:** Sendest du im Figma-Plugin einen Frame, übernimmt das Toolkit sofort, was eindeutig ist — Palette, Textfarbe, Schriftgröße und -schnitt, Rahmen, Ecken, Deckkraft — und die Overlays zeigen es live. Was mehr verlangt (Verschieben, Größen, neue Ebenen, deine Wünsche aus der Notiz), wartet unter Overlays & Alerts → Aussehen → **Entwürfe aus Figma**; der Reiter zeigt, wie viel offen ist. In der Entwicklungsversion startet **Umsetzen lassen** dort Claude im Hintergrund: Es setzt nur die offenen Entwürfe um, ändert nur Overlay-Dateien, und das Ergebnis erscheint im Reiter und im Showcase. Versucht der Lauf, Skripte oder externe Adressen in ein Overlay zu schreiben, wird das zurückgenommen und nichts verbucht. Dort lässt sich jede übernommene Änderung auch zurücknehmen; eine Palettenfarbe kannst du stattdessen „behalten“. Im Figma-Plugin gehört das **Figma-Token** eingetragen (im Log: „Figma token“) — es gilt nur für diese Figma-Verbindung, nicht für die ganze App.

**Die Reihenfolge ist egal.** Startet OBS vor dem Toolkit, laden die Browser-Quellen ins Leere und bleiben leer — deshalb lädt das Toolkit jede Browser-Quelle, die auf localhost:4000 zeigt, selbst neu, sobald es OBS erreicht. Quellen anderer Dienste bleiben unangetastet.

**Größe der Schrift:** Ein einziger Regler unter Overlays & Alerts → Aussehen stellt sie für alle Overlays zugleich — Titel, Kicker und Zahlen ziehen mit, nicht nur der Fließtext. Standard sind 18px. Wächst die Schrift, wächst auch der Kasten: Passt eine Browser-Quelle in OBS danach nicht mehr, gib ihr ein paar Pixel mehr Höhe.

**Custom Overlays:**
- Overlays & Alerts → Overlays → „+ Eigenes Overlay“
- Aus Template erstellen oder eigene HTML-Datei hochladen
- URL: http://localhost:4000/overlay/custom/<name>/index.html

**Eigene Overlays entwickeln:**
Das Template unter /overlay/_template/index.html enthält:
- Alle verfügbaren WebSocket-Events
- Alle Public API Endpoints
- Zwei Design-Vorlagen (Pixel Art + Modern)
- Helper-Funktionen (Auto-Reconnect, escapeHtml)`,
  },
  {
    title: 'Notion Integration',
    content: `Clips werden automatisch in eine Notion-Datenbank gesynct.

**Einrichtung:**
1. Gehe auf notion.so/my-integrations
2. Neue Integration erstellen
3. Token kopieren → im Toolkit unter Settings eintragen
4. Notion-Datenbank erstellen mit diesen Properties:
   - Clip (Title)
   - Tag (Select)
   - Session (Date)
   - Zeitstempel (Rich Text)
   - Notiz (Rich Text)
   - Synced (Checkbox)
5. Datenbank mit der Integration teilen (Share → Invite)
6. Datenbank-ID im Toolkit eintragen (URL oder ID)

**Sync:**
- Clips Panel → "Sync to Notion" Button
- Synct alle Clips der aktuellen Session`,
  },
  {
    title: 'Stream Deck',
    content: `Das "NST Deck" Stream Deck Plugin bietet 10 Buttons mit Live-Status.

**Installation:**
- Die Datei assets/com.nst.deck.streamDeckPlugin doppelklicken — die Stream-Deck-App fragt, ob sie das Plugin installieren soll
- Oder: .streamDeckPlugin Datei manuell öffnen

**Einrichtung:**
1. Beliebigen "NST" Button aufs Deck ziehen
2. Button anklicken → Property Inspector unten
3. API Token eintragen (einmalig, gilt für alle Buttons)
4. Button-spezifische Settings konfigurieren

**Verfügbare Buttons:**
| Button | Aktion | Live-Anzeige |
|--------|--------|-------------|
| Scene Switch | OBS-Szene wechseln | Aktuelle Szene |
| Clip Marker | Clip markieren | Session Clip-Anzahl |
| Neuer Eintrag | Eintrag erstellen | Offene Einträge |
| Challenge | Start/Stop/Done/Fail | Status + Titel |
| Todo Check | Nächstes Todo abhaken | Offene Todos |
| Hype Moment | Hype Moment auslösen | Flash-Animation |
| Glücksrad | Roulette drehen | Spin-Animation |
| Milestone | Milestone abschließen | Pending-Anzahl |
| Figur wechseln | Nächste Figur ins Overlay (pinnt fest) | Name der Figur |
| Karte festpinnen | Festpinnen oder wieder dem Worldbuilder folgen | Folgt / Festgepinnt / Folgen aus |

**API Token:**
- Findest du unter Einstellungen → Daten → Stream Deck API Token
- Bleibt gleich nach Neustart der App`,
  },
  {
    title: 'API Referenz',
    content: `Alle API-Endpoints sind unter http://localhost:4000/api/ erreichbar.
Auth-Header: Authorization: Bearer <token>

**Public Endpoints (ohne Auth):**
- GET /public/stream-state
- GET /public/issues
- GET /public/progress — Projekt, Items und ihre Todos
- GET /public/chat — die letzten Chat-Nachrichten
- GET /public/reward-stats/top — Rangliste (?type=all&limit=3)
- GET /public/overlay-config — Farben und Schriften
- GET /public/entry — die Eintragskarte, ohne ausgeblendete Felder
- GET /public/character — dieselbe Karte im alten Figuren-Format

**Stream State:**
- GET /api/stream-state
- PATCH /api/stream-state

**Welt:**
- GET /api/entries/arten — die Arten der Quelle, mit Farbe
- GET /api/entries?art=Figur — alle Einträge einer Art, mit ihren ausgeblendeten Feldern
- GET /api/entries/active — POST /api/entries/active — DELETE /api/entries/active
- POST /api/entries/:id/hidden — { fields: ["Kurzbeschreibung", "@text", "@aliases", "@image"] }
- GET /api/entries/follow — POST /api/entries/follow — { enabled?, held?, settleSeconds? }
- POST /api/entries/follow/toggle-hold — festpinnen oder wieder folgen (Stream Deck)
- POST /api/entries/follow/check — einmal in den Worldbuilder schauen und die Karte wechseln, wenn es passt
- GET /api/characters/source — POST /api/characters/source — { source: "worldbuilder" | "notion" }
- POST /api/characters/cycle — nächste Figur ins Overlay (Stream Deck)

**Erklär-Commands:**
- GET /api/text-commands — POST /api/text-commands — PATCH /api/text-commands/:id — DELETE /api/text-commands/:id
- POST /api/text-commands/preview — { response } → wie der Text im Chat ankommt
- GET /api/lookup-commands — POST /api/lookup-commands — PATCH /api/lookup-commands/:id — DELETE /api/lookup-commands/:id
- GET /api/lookup-commands/arten — die Arten der offenen Worldbuilder-Welt
- POST /api/chat/try — { message, as?: "viewer" } → was der Chat antworten würde (!befehle, eigene Texte, Nachschlagen)

**Issues:**
- GET /api/issues — POST /api/issues — PATCH /api/issues/:id — DELETE /api/issues/:id

**Progress & Todos:**
- GET /api/progress — PATCH /api/progress/project — GET /api/progress/export
- POST /api/progress/items — PATCH /api/progress/items/:id — DELETE /api/progress/items/:id
- POST /api/progress/items/:id/todos — PATCH /api/progress/todos/:id — DELETE /api/progress/todos/:id
- GET /api/progress/github — POST /api/progress/github — POST /api/progress/import/github

**Abstimmungen:**
- GET /api/designs — POST /api/designs — PATCH /api/designs/:id — DELETE /api/designs/:id

**Song-Wünsche:**
- GET /api/song-requests — POST /api/song-requests/clear
- POST /api/song-requests/:id/play — POST /api/song-requests/:id/skip — DELETE /api/song-requests/:id

**Reward Stats:**
- GET /api/reward-stats — GET /api/reward-stats/types — GET /api/reward-stats/:username
- POST /api/reward-stats — DELETE /api/reward-stats/:username/:type

**Clip-Tags & Overlay-Farben:**
- GET /api/clip-tags — POST /api/clip-tags — DELETE /api/clip-tags/:tag
- GET /api/overlay-config — POST /api/overlay-config — DELETE /api/overlay-config

**Clips:**
- GET /api/clips — POST /api/clips — PATCH /api/clips/:id — DELETE /api/clips/:id
- GET /api/clips/sessions — POST /api/clips/sync

**Milestones:**
- GET /api/milestones — POST /api/milestones — PATCH /api/milestones/:id — DELETE /api/milestones/:id

**OBS:**
- GET /api/obs/config — POST /api/obs/config
- GET /api/obs/status — POST /api/obs/connect — POST /api/obs/disconnect
- GET /api/obs/scenes — POST /api/obs/scene
- POST /api/obs/screens — legt die Szenen für Start, Pause und Ende an
- GET /api/obs/mappings — POST /api/obs/mappings

**Rewards:**
- GET /api/rewards — POST /api/rewards — PATCH /api/rewards/:id

**Voting:**
- GET /api/voting — POST /api/voting/start — POST /api/voting/end — POST /api/voting/cancel

**Actions:**
- POST /api/actions/compile-pray
- POST /api/actions/roulette — GET /api/actions/roulette/status
- GET /api/actions/song — POST /api/actions/song

**Stats:**
- GET /api/stats

**Backup:**
- GET /api/backup/export — POST /api/backup/import

**Overlays:**
- GET /api/overlays/builtin — GET /api/overlays
- POST /api/overlays — PUT /api/overlays/:name — DELETE /api/overlays/:name
- GET /api/overlays/template`,
  },
  {
    title: 'WebSocket Events',
    content: `WebSocket-Verbindung: ws://localhost:4000?overlay=1

Alle Events werden als JSON gesendet: { "event": "name", "data": { ... } }

**Stream:**
- stream-state — Stream-Status geändert

**Einträge:**
- issue-created / issue-updated / issue-deleted

**Welt:**
- entry-changed — neue Eintragskarte (oder null), ausgeblendete Felder schon entfernt
- character-changed — dieselbe Karte im alten Figuren-Format (Stream Deck)
- follow-changed — Worldbuilder folgen an/aus, festgepinnt oder nicht, Wartezeit

**Progress & Todos:**
- progress-update — Projekt-Fortschritt oder Todos geändert

**Milestones:**
- milestone-trigger / milestone-created / milestone-updated / milestone-deleted

**Clips:**
- clip-created / clip-updated / clip-deleted
- clip-sync-failed — Notion-Sync fehlgeschlagen
- clip-tags-changed

**Rewards:**
- reward-redeemed / reward-updated
- reward-leaderboard-update — Rangliste geändert

**Abstimmungen:**
- poll-update / poll-close / vote-result
- design-created / design-updated / design-deleted

**Songs:**
- song-update / song-clear — Now Playing
- sr-update — Song-Wünsche geändert

**OBS:**
- obs-status — Verbindungsstatus geändert
- obs-scene-changed — Szene gewechselt

**Bot:**
- bot-status — Bot verbunden/getrennt

**Actions:**
- compile-pray — Hype Moment ausgelöst
- roulette-spin / roulette-result / roulette-cooldown — Glücksrad

**Overlays:**
- overlay-config — Farben oder Schriften geändert`,
  },
  {
    title: 'Tastenkürzel',
    content: `Die App hat globale Hotkeys die auch funktionieren wenn die App im Hintergrund ist.

Hotkeys werden über die Hotkey-Konfiguration in der App verwaltet. Die Hotkeys lösen die gleichen API-Calls aus wie die Stream Deck Buttons.`,
  },
  {
    title: 'Troubleshooting',
    content: `**"Port 4000 already in use":**
Eine alte Instanz der App läuft noch. Beende sie im Task Manager oder starte den Computer neu.

**OBS verbindet nicht:**
- Ist der WebSocket Server in OBS aktiviert? (Tools → WebSocket Server Settings)
- Stimmt das Passwort?
- Ist der Port korrekt (Standard: 4455)?
- Läuft OBS?

**Bot verbindet nicht:**
- Client-ID korrekt eingetragen?
- OAuth-Token abgelaufen? Neu verbinden über Settings

**Overlays zeigen nichts:**
- Läuft die App? (http://localhost:4000/api/health testen)
- Browser Source URL korrekt? Muss mit http://localhost:4000/overlay/ anfangen
- Browser Source in OBS refreshen (Rechtsklick → Refresh). Nötig ist das
  normalerweise nicht mehr: Das Toolkit lädt die eigenen Browser-Quellen neu,
  sobald es OBS erreicht.
- Liegt die Quelle überhaupt in der Szene, die du gerade zeigst? Eine Quelle
  gehört zu einer Szene, nicht zum ganzen Profil.

**Stream Deck Buttons zeigen "OFFLINE":**
- Läuft die App?
- API Token im Plugin eingetragen?
- Host/Port korrekt? (Standard: localhost:4000)`,
  },
];
