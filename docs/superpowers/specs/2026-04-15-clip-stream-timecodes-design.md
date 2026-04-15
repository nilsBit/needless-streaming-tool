# Clip Stream/Recording Timecodes

## Problem

Clips speichern aktuell nur `created_at` (Uhrzeit). Es fehlt die elapsed time seit Stream- oder Aufnahme-Start (z.B. "1:23:45"), die fuer den Videoschnitt in DaVinci Resolve essenziell ist.

## Loesung

Automatisch per OBS WebSocket erkennen ob gestreamt/aufgenommen wird, und beim Clip-Erstellen den exakten Timecode von OBS holen.

## Ansatz

**OBS-Events + On-Demand Timecode:**
- OBS-Events (`StreamStateChanged`, `RecordStateChanged`) tracken ob Stream/Recording aktiv ist
- Beim Clip-Erstellen: ein `GetStreamStatus`/`GetRecordStatus` Call fuer den exakten Timecode
- Kein Polling, kein Timer-Drift

## Datenmodell

### DB-Migration (v5 -> v6)

```sql
ALTER TABLE clips ADD COLUMN stream_timecode TEXT;
ALTER TABLE clips ADD COLUMN recording_timecode TEXT;
ALTER TABLE stream_state ADD COLUMN is_recording INTEGER DEFAULT 0;
```

Beide Timecode-Felder nullable — wenn weder Stream noch Recording aktiv, bleiben sie `null`.

### Shared Type `Clip`

```ts
export interface Clip {
  id: number;
  tag: string;
  note: string | null;
  session_date: string;
  stream_timecode: string | null;    // NEW
  recording_timecode: string | null;  // NEW
  created_at: string;
}
```

### Timecode-Format

`HH:MM:SS` — OBS liefert `HH:MM:SS.mmm`, Millisekunden werden abgeschnitten.

## OBS Event-Tracking

### In `src/server/obs/index.ts`

Nach erfolgreichem `connect`:

- Listener auf `StreamStateChanged` -> updated `stream_state.is_live` automatisch
- Listener auf `RecordStateChanged` -> updated `stream_state.is_recording` automatisch
- Zwei In-Memory-Booleans: `isStreaming` und `isRecording` fuer schnellen Zugriff

### Neue Funktion

```ts
export async function getStreamTimecodes(): Promise<{
  stream_timecode: string | null;
  recording_timecode: string | null;
}>
```

- Wenn `isStreaming` -> `obs.call('GetStreamStatus')` -> `outputTimecode` parsen
- Wenn `isRecording` -> `obs.call('GetRecordStatus')` -> `outputTimecode` parsen
- Beide Calls parallel wenn beides aktiv
- Wenn OBS nicht verbunden oder weder Stream/Recording -> beide `null`

## Clip-Erstellung

### In `src/server/api/clips.ts` — POST-Route

- Route wird `async`
- Vor dem INSERT: `getStreamTimecodes()` aufrufen
- Beide Timecodes mit in den INSERT schreiben

```ts
const { stream_timecode, recording_timecode } = await getStreamTimecodes();
const result = getDb().prepare(
  'INSERT INTO clips (tag, note, session_date, stream_timecode, recording_timecode) VALUES (?, ?, ?, ?, ?)'
).run(tag, note || null, sessionDate, stream_timecode, recording_timecode);
```

## UI-Anzeige

### In `ClipsPanel.tsx`

Anzeige-Logik pro Clip:

| Zustand | Anzeige |
|---------|---------|
| `stream_timecode` vorhanden | `🔴 1:23:45 \| 14:23:45` |
| Nur `recording_timecode` | `⏺ 2:10:30 \| 14:23:45` |
| Beides vorhanden | `🔴 1:23:45 ⏺ 2:10:30 \| 14:23:45` |
| Keins vorhanden | `14:23:45` (wie bisher) |

Stream-Zeit steht immer vorne (prominenter), Uhrzeit dahinter.

## DaVinci-Export

### In der Export-Route (`GET /clips/export`)

Timecode-Prioritaet pro Clip:

1. `stream_timecode` (wenn vorhanden) -> direkt als Timecode nutzen
2. `recording_timecode` (wenn vorhanden) -> als Fallback
3. Alte Berechnung (relativ zum ersten Clip) -> letzter Fallback

CSV-Format bleibt gleich (`Name,Start,End,Note`), nur die Timecodes sind jetzt echte OBS-Zeiten.

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/server/db/schema.ts` | Migration v6: neue Spalten |
| `src/shared/types.ts` | `Clip` Interface + `StreamState` erweitern |
| `src/server/obs/index.ts` | Event-Listener, `getStreamTimecodes()` |
| `src/server/api/clips.ts` | POST async, Timecodes einfuegen, Export anpassen |
| `src/renderer/src/panels/ClipsPanel.tsx` | Timecode-Anzeige |
