# Overlay-Variablen für Figma Design

> Nutze diese Variablen als Text-Layer in Figma. Sie werden automatisch mit echten Daten ersetzt.

---

## Challenge-Banner Overlay

Empfohlene Größe: **800x200px**

| Variable | Beispiel-Wert | Beschreibung |
|----------|--------------|-------------|
| `{experiment_title}` | Knockback einbauen | Der Challenge-Titel |
| `{experiment_status}` | Läuft / Geschafft! / Gescheitert | Aktueller Status |
| `{timer}` | 05:23 | Timer im MM:SS Format |
| `{status_color}` | Rot / Grün / Rot | Farbe je nach Status (in_progress=rot, done=grün, failed=rot) |

---

## Alerts Overlay

Empfohlene Größe: **800x400px**

| Variable | Beispiel-Wert | Beschreibung |
|----------|--------------|-------------|
| `{alert_title}` | ⚔️ RAID! / ⚡ HYPE MOMENT ⚡ | Alert-Titel |
| `{alert_subtitle}` | TestStreamer mit 25 Viewern — elite Enemy! | Alert-Beschreibung |
| `{alert_type}` | raid / reward / compile | Bestimmt die Farbe/Style |

### Alert-Typen

| Type | Wann | Beispiel-Titel | Beispiel-Subtitle |
|------|------|---------------|-------------------|
| `raid` | Raid eingehend | ⚔️ RAID! | StreamerName mit 25 Viewern — elite Enemy! |
| `reward` | Channel Point Reward | 💥 Spawn 50 Enemys! | von UserName |
| `compile` | Hype Moment / Roulette | ⚡ HYPE MOMENT ⚡ | Läuft es? Oder crashed es? |

---

## Glücksrad Overlay

Empfohlene Größe: **400x500px**

| Variable | Beispiel-Wert | Beschreibung |
|----------|--------------|-------------|
| `{bug_title}` | Player Handstand | Einzelner Bug-Name |
| `{bug_list}` | Array von Bug-Titeln | Alle offenen Bugs für die Wheel-Animation |
| `{winner_title}` | Player Handstand | Der ausgewählte Bug nach dem Spinning |
| `{state}` | spinning / winner / hidden | Animation-Status |

### States

| State | Was passiert |
|-------|-------------|
| `hidden` | Overlay unsichtbar |
| `spinning` | Bugs werden schnell durchgewechselt, einer ist highlighted |
| `winner` | Gewinner-Bug leuchtet auf, Rest gedimmt |

---

## Poll Overlay

Empfohlene Größe: **300x400px**

| Variable | Beispiel-Wert | Beschreibung |
|----------|--------------|-------------|
| `{poll_title}` | 🎨 Chat Design | Abstimmungs-Titel |
| `{option_label}` | feuer | Option-Name (wiederholt sich pro Option) |
| `{option_votes}` | 12 | Anzahl Stimmen |
| `{option_percent}` | 45% | Balken-Breite prozentual |

### Zustände

| State | Was passiert |
|-------|-------------|
| Aktiv | Poll sichtbar mit Live-Balken |
| Geschlossen | Verschwindet nach 5 Sekunden |

---

## Song Display Overlay

Empfohlene Größe: **300x80px**

| Variable | Beispiel-Wert | Beschreibung |
|----------|--------------|-------------|
| `{song_title}` | Lo-Fi Beats | Song-Titel |
| `{song_requester}` | ChatUser123 | Wer den Song requested hat (optional, kann leer sein) |

---

## Design-Tipps für Figma

- **Hintergrund:** Transparent lassen — in OBS wird es über dem Stream gelegt
- **Variablen:** Als normalen Text-Layer schreiben, z.B. `{experiment_title}`
- **Farben:** Empfohlen aus dem Spiel: Feuer-Orange (#e67e22), Dunkelheit-Lila/Blau
- **Style:** Clean, dunkel, Pixel-Art-Elemente — nicht überladen (Chill-Vibe)
- **Fonts:** Monospace für Timer/Zahlen, Sans-Serif für Text
- **Animationen:** Nicht in Figma designen — beschreib sie als Notiz (z.B. "fade in 0.4s")

## Figma → Code Workflow

1. Design alle Overlays in Figma mit den Variablen als Platzhalter
2. Teile die Figma-Datei URL mit mir
3. Ich lese die Designs über die Figma API aus
4. Baue die Overlays 1:1 in HTML/CSS nach
5. Ersetze die Variablen mit den echten Live-Daten
