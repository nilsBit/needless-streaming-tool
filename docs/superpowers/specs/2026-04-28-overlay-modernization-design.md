# Overlay Modernization

## Overview

Modernize all 11 overlay HTML files to a clean, unified visual style. Remove aggressive cyberpunk elements (skew, neon glow, noise textures) and align with the Reward Leaderboard overlay's cleaner aesthetic.

## Design Principles

- **No skew transforms** — straight edges with `border-radius: 6px`
- **No neon glow / text-shadow** — clean colors without bloom effects
- **Rajdhani as display font** — replaces Bebas Neue everywhere (Inter stays as body font)
- **No decorative pseudo-elements** — remove diagonal stripes, noise textures (`::before`/`::after` deco layers)
- **No farbige border-left** — cards use `border: 1px solid rgba(255,255,255,0.08)` instead. Status colors only in text.
- **Animations stay** — slide-in, fade, pulse transitions remain, but without glow effects
- **Color palette stays** — pink (#ff2d7b), cyan (#00d4ff), orange (#ff6b35), lime (#39ff14) — just used more subtly
- **CSS variable config system stays** — overlay-config still works
- **Transparent backgrounds stay** — OBS-compatible

## Exceptions

- **Reward Leaderboard + Rankchange** — keep Gold (#ffd700), Silver (#c0c0c0), Bronze (#cd7f32) `border-left` for rank distinction. Already has the target style, only needs Bebas→Rajdhani swap if applicable (already uses Rajdhani).
- **Roulette** — SVG wheel keeps its colors. Surrounding UI (result display, text) gets modernized.

## Per-Overlay Changes

### progress/index.html
- Remove all `transform: skewX()` and counter-skew
- Remove `::before`/`::after` decorative layers (stripes, noise)
- Remove `text-shadow` and `box-shadow` glow effects
- Replace `border-left` color accents with subtle border
- Swap Bebas Neue → Rajdhani
- Keep progress bar with clean fill (no glow gradient)

### alerts/index.html
- Remove skew transforms on alert cards
- Remove neon explosion effect on compile events
- Remove spray paint noise texture
- Remove diagonal stripe accent bar
- Swap Bebas Neue → Rajdhani
- Keep slide-in/out animation, just without glow

### roulette/index.html
- SVG wheel stays as-is (colors, segments, animation)
- Remove glow effects on surrounding UI elements
- Remove decorative SVG patterns around the wheel (if excessive)
- Swap Bebas Neue → Rajdhani for result text
- Clean up result display card

### poll/index.html
- Remove skew, glow, decorative elements
- Clean card style with subtle border
- Swap Bebas Neue → Rajdhani

### song/index.html
- Remove skew, glow
- Clean now-playing card style
- Swap Bebas Neue → Rajdhani

### song-queue/index.html
- Remove skew, glow
- Clean queue item cards
- Swap Bebas Neue → Rajdhani

### milestone/index.html
- Remove skew, glow
- Clean milestone notification card
- Swap Bebas Neue → Rajdhani
- Keep celebratory animation but without neon bloom

### todos/index.html
- Remove skew, glow
- Clean todo item cards
- Swap Bebas Neue → Rajdhani

### experiment/index.html
- Remove skew, glow
- Clean challenge display card
- Swap Bebas Neue → Rajdhani

### reward-leaderboard/index.html
- Already target style — no changes needed (already uses Rajdhani, border-radius, no skew)

### reward-rankchange/index.html
- Already target style — no changes needed

## Card Style Reference

```css
/* Standard card (all overlays except leaderboard ranks) */
.card {
  padding: 8px 12px;
  background: rgba(10, 10, 10, 0.85);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Header/label text */
.header {
  font-family: 'Rajdhani', sans-serif;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.5);
}

/* Status text colors (no border, no glow) */
.status-done { color: #2ecc71; }
.status-active { color: #ff6b35; }
.status-pending { color: rgba(255, 255, 255, 0.4); }
```

## Files to Modify

| File | Scope |
|------|-------|
| `src/overlays/progress/index.html` | Full CSS rewrite + remove deco JS |
| `src/overlays/alerts/index.html` | Full CSS rewrite |
| `src/overlays/roulette/index.html` | Partial CSS (UI around wheel) |
| `src/overlays/poll/index.html` | Full CSS rewrite |
| `src/overlays/song/index.html` | Full CSS rewrite |
| `src/overlays/song-queue/index.html` | Full CSS rewrite |
| `src/overlays/milestone/index.html` | Full CSS rewrite |
| `src/overlays/todos/index.html` | Full CSS rewrite |
| `src/overlays/experiment/index.html` | Full CSS rewrite |
| `src/overlays/reward-leaderboard/index.html` | No changes |
| `src/overlays/reward-rankchange/index.html` | No changes |
| `src/overlays/_template/index.html` | Update to new style |

## Out of Scope

- Changing overlay functionality or data flow
- Adding new overlays
- Changing the overlay config system
- Changing WebSocket/fetch patterns
