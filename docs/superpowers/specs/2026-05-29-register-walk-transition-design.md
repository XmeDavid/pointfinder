# Register "Walk the Map" Transition — Design

**Date:** 2026-05-29
**Status:** Approved (design). Local-only spec (not committed per repo convention).
**Supersedes:** the current opacity-only landing→register crossfade
(`.topo-register-transition*` layers + `topoTransition*` keyframes in
`web-admin/src/index.css`).

## Goal

Replace the brief opacity crossfade with an engaging ~1.2s cinematic beat: the
landing chrome fades to black leaving only the topographic terrain, the "camera"
walks across the map (slow→fast→slow pan + gentle zoom-out) while the world
inverts from dark/bright-green to light/faint-green (register's palette), and
the terrain resolves *into* register's own background so the page's card simply
rises in. No cut, no flash — "the map becomes the page."

Hard constraint: must be smooth on integrated GPUs. Therefore **translate +
opacity only** — no CSS `mask`, no `filter`, no per-frame raster.

## Beat sheet (~1.2s)

1. **0–0.15s** — landing chrome fades to black; green terrain remains on a dark field.
2. **0.15–1.0s** — pan wrapper translates diagonally + zooms 1.2×→1.0× on a
   slow→fast→slow ease; dark terrain layer crossfades out while light terrain +
   light wash crossfade in (the "inversion").
3. **1.0–1.2s** — settles dead-center at register's exact framing (translate 0,
   scale 1); soft glow blooms where the card will sit.
4. **Handoff** — navigate to `/register`; final overlay frame == register
   backdrop, so register's existing `--arrived` card-rise plays seamlessly.

## Layers (single fixed overlay, `z-80`)

All inside one **pan wrapper** that animates `transform: translate() scale()`:

- `__field` — dark backdrop fill; fades in first, out during inversion.
- `__terrain-dark` — baked bright-green-on-transparent texture; opacity 1→0.
- `__terrain-light` — baked faint-green-on-transparent texture (register's look); opacity 0→1.
- `__light-wash` — light gradient (`--color-card`→`--color-background`) under light terrain; opacity 0→1.
- `__glow` — destination radial bloom near the end; opacity only.

Inversion = dark↔light layer **crossfade** (opacity). Pan = wrapper transform.
Nothing else animates.

## Baked textures (committed to `public/landing/`)

- `topo-terrain-dark.webp` — contours bright green (~`#22c55e`) on transparent, ~2560×1810.
- `topo-terrain-light.webp` — contours faint primary green on transparent, identical dims/registration.

Both larger than viewport so pan/zoom has travel room; identical registration so
they pan in lockstep.

**Continuity unification:** `.register-atlas-screen__backdrop::after` switches
from its live `mask` to `background: url(topo-terrain-light.webp) center/cover`,
so the overlay's last frame is pixel-identical to the landed page (and register's
backdrop gets cheaper too).

## Tuning knobs (CSS custom properties)

```
--topo-walk-duration: 1.2s;
--topo-walk-ease: cubic-bezier(0.65, 0, 0.35, 1);  /* slow→fast→slow */
--topo-walk-from: translate(-7%, 5%) scale(1.2);
--topo-walk-to:   translate(0, 0) scale(1);
```

## Handoff & no-flash

- `startRegisterTransition` timeout extended 620ms → ~1200ms (match duration).
- Preload register route + both textures on Register button **hover/focus**
  (and on idle) so first paint is instant.
- Overlay's final frame == register backdrop → swap invisible; `--arrived`
  runs the card rise.
- Fallback if a flash appears on weak hardware: promote overlay to route-level
  (survives navigation). Not built unless needed.

## Reduced motion

`prefers-reduced-motion: reduce` → skip the walk, instant navigate (current
behavior preserved). Overlay layers get `animation: none`.

## Asset baking (no new repo deps)

One-time throwaway generation: temporary local node HTTP receiver (`/tmp`, not
committed) + the running headless Chrome canvas — `drawImage` a tinted SVG →
`canvas.toBlob('image/webp')` → `fetch` POST to the receiver, which writes the
file to `public/landing/`. Only the two `.webp` files are committed; no `sharp`
or native dep added to the repo.

## Files touched

- `web-admin/src/index.css` — rewrite `.topo-register-transition*` + keyframes;
  unify `.register-atlas-screen__backdrop::after`.
- `web-admin/src/features/public/LandingPage.tsx` — `TopoRegisterTransition`
  markup (new layers); nav timeout 620→1200; preload-on-hover for register + textures.
- `web-admin/public/landing/topo-terrain-dark.webp`, `topo-terrain-light.webp` — new assets.
- Remove now-unused `topography-contours-green.svg` if nothing else references it.

## Verification

- `tsc --noEmit` + `eslint` clean.
- Preview freeze-frames at ~10% / ~50% / ~90% / 100% confirming pan progress,
  inversion crossfade, and final-frame match with register backdrop.
- Confirm 0 animations at rest; confirm reduced-motion path instant-navigates.
