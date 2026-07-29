# Clips Panel: Compact Rows Redesign

**Datum:** 2026-04-21

## Problem

Clip-Cards nehmen die volle Breite ein und sehen bei wenigen Clips leer und verloren aus. Das Card-Layout mit gestapelten Rows (Top/Mid/Note/Actions) ist zu groß für einzelne Momente.

## Lösung — Kompakte Inline-Zeilen

Clips werden als einzeilige Rows statt als gestapelte Cards dargestellt. Jede Zeile zeigt alle relevanten Infos auf einen Blick.

## Entwurf

### Row-Layout

Jede Clip-Zeile ist ein Flexbox-Row:

```
14:32:05  ⭐ highlight  "Nice combo"  ✅  ✕
```

Spalten (links nach rechts):
- **Zeit** — Uhrzeit oder Stream-Timecode wenn vorhanden. Muted, `font-size: 12px`, `min-width: 70px`.
  - Wenn `stream_timecode` vorhanden: `🔴 01:23:45` statt Wall-Clock-Zeit
  - Wenn `recording_timecode` auch vorhanden: als `title`-Attribut (Tooltip)
- **Tag** — Emoji + Tag-Name. Akzentfarbe (`#e67e22`), `font-size: 13px`, `min-width: 100px`.
  - Auto-Clips: `🤖` Prefix vor dem Emoji
  - Confidence-Dot bleibt inline nach dem Tag-Namen
- **Note** — Italic, muted, `flex: 1`, `text-overflow: ellipsis`, `white-space: nowrap`, `overflow: hidden`.
  - Keine Note: Spalte ist einfach leer, Zeile wird nicht breiter/schmaler
- **Sync-Badge** — Bestehendes `<ClipSyncBadge>`, unverändert
- **Actions** — Delete-Button (✕), `opacity: 0` → `1` on row hover
  - Auto-Clips: zusätzlich ✓ Confirm und ✕ Reject Buttons inline (immer sichtbar, nicht on-hover)

### Styling

**Normale Clips:**
- Kein Card-Background, kein Border
- `border-bottom: 1px solid rgba(255,255,255,0.06)` als Trenner
- `padding: 6px 4px`
- Hover: `background: rgba(255,255,255,0.03)`

**Auto-Clips:**
- `border-left: 2px dashed rgba(250,180,50,0.4)` statt dashed Card-Border
- `padding-left: 8px`
- Confirm/Reject Buttons inline am Ende der Zeile, klein (`padding: 3px 8px`, `font-size: 11px`)

**Light-Mode:**
- `border-bottom-color: rgba(0,0,0,0.08)`
- Hover: `background: rgba(0,0,0,0.02)`
- Auto-Clip border: `rgba(230,126,34,0.3)`

### JSX-Änderungen

Die bestehende `clip-item` Struktur (3 Rows: `clip-row-top`, `clip-row-mid`, `clip-row-note`, `clip-row-actions`) wird zu einer einzeiligen Struktur:

```tsx
<div className={`clip-row ${isAutoClip(clip) ? 'auto-clip' : ''}`}>
  <span className="clip-row-time" title={fullTimecodeTooltip}>
    {displayTime}
  </span>
  <span className="clip-row-tag">
    {isAutoClip(clip) && '🤖 '}
    {TAG_EMOJI[baseTag] || '🏷️'} {clip.tag}
    {clip.confidence && <span className={`confidence-dot ${clip.confidence}`}>...</span>}
  </span>
  <span className="clip-row-note">{clip.note && `"${clip.note}"`}</span>
  <ClipSyncBadge state={syncStateFor(clip)} onRetry={() => retryClip(clip.id)} />
  {isAutoClip(clip) ? (
    <>
      <button className="btn-clip-confirm" onClick={() => confirmClip(clip)}>✓</button>
      <button className="btn-clip-reject" onClick={() => deleteClip(clip.id)}>✕</button>
    </>
  ) : (
    <button className="btn-clip-delete" onClick={() => deleteClip(clip.id)} title={t('tooltip.delete')}>✕</button>
  )}
</div>
```

### Was sich NICHT ändert

- Day-Header — bleibt identisch
- Tag-Filter-Leiste — bleibt identisch
- Add-Clip-Formular — bleibt identisch
- ClipSyncBadge-Komponente — bleibt identisch
- API/Backend — kein Change
- Tour-Selektoren — `.clip-custom select`, `.clip-custom input`, `.clip-tags .tag-btn` etc. bleiben gleich

## Geänderte Dateien

- **Modify:** `src/renderer/src/panels/ClipsPanel.tsx` — JSX der Clip-Darstellung
- **Modify:** `src/renderer/src/index.css` — Neue Row-Styles, alte Card-Styles ersetzen

## Aufräumen

Die alten Card-Styles (`.clip-item` mit flex-direction column, `.clip-row-top`, `.clip-row-mid`, `.clip-row-note`, `.clip-row-actions`) werden durch die neuen Row-Styles ersetzt.

## Konventionen

- Direkter Commit auf `main`, conventional commits
- Typecheck + lint + manuelles QA
