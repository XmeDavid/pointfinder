# Design-system decisions and exceptions

| Date | Decision / exception | Reason | Owner | Intended resolution |
|---|---|---|---|---|
| 2026-07-11 | Existing native `Waypoint*`, `Trail*`, and `pf*` aliases remain temporarily. | Avoid a risky all-screen cutover while generated semantic adapters land. | Mobile UI | Migrate consumers mode-by-mode, then remove aliases. |
| 2026-09-05 | `QrCodeSvg` paints literal `#000000` on `#ffffff` instead of semantic tokens. | A QR code must stay dark-on-light in both themes and on paper to remain scannable; theming it would break field use. | PointFinder frontend | None — this is a permanent, machine-readable-graphic exception. |
| 2026-09-08 (retired 2026-09-12: the onboarding world was removed) | Auth onboarding GLB artwork and its renderer use authored physical material/light colors and camera geometry. | Blue uniforms, yellow/navy scarves, terrain and warm lighting are illustration content, not interface/status colors. The full-viewport canvas needs geometry-aware framing around the DOM overlay. | PointFinder frontend / illustration | Retain as a scoped illustration exception; every title, control, focus state and scrim continues to use canonical semantic tokens. Reassess asset budgets on device before extending the world. |
| 2026-09-08 | The public homepage re-maps the semantic surface tokens inside `.landing-page` to a marketing palette (`dataColor.atlasCream`, `atlasCreamDeep`, `atlasEvergreen`, `atlasEvergreenDeep`, `atlasInk`, `atlasMist`, `atlasMint`), and its evergreen and cream bands stay the same in both themes. | The approved editorial concept is evergreen forest, cream paper, evergreen; its illustrations are dark, and the cream band is the page's rhythm. Canonical buttons, badges and cards keep their shape and behaviour, only the scoped surface and action roles change, and nothing leaks past the homepage. | PointFinder frontend | Keep scoped to `.landing-page`; the pricing band follows the app theme. Revisit if the marketing palette becomes a second product theme. |
| 2026-09-09 | Brand bitmap exports (favicon.ico, touch icon, launcher PNGs) are produced by `brand-raster.py` and pinned by sha256 in `brand/exports.json` instead of being regenerated inside `generate.mjs`; Tauri icon sets come from `tauri icon` via `brand-tauri.mjs` and are pinned the same way, except `icon.icns`. | Node has no dependency-free SVG rasterizer, and bitmap bytes vary across rasterizer versions; hash pinning (master bytes, `color.brand` values, every output) still fails `--check` whenever a source or an export changes without rerunning the pipeline. `icon.icns` is not byte-stable between identical `tauri icon` runs. Launcher artwork colors are the `color.brand.*` tokens, not UI action colors. | PointFinder frontend | Revisit if a checked-in JS rasterizer is adopted; then fold the bitmaps into byte comparison. |

## 2026-09-05 — Single frontend ownership

Owner: PointFinder frontend. Canonical React primitives, Storybook and semantic
theme now live in `web/`; generators write to `web/src/generated`. Tauri embeds
the same frontend with platform-specific adapters. Existing player screens are
migrated without claiming native journey parity. Legacy Swift/Compose adapters
remain until the device rollout checklist in `docs/frontend-consolidation.md` is
complete. Resolve remaining player media/push and device UX gaps before retiring
the old platform applications.
