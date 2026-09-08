# Design-system decisions and exceptions

| Date | Decision / exception | Reason | Owner | Intended resolution |
|---|---|---|---|---|
| 2026-07-11 | Existing native `Waypoint*`, `Trail*`, and `pf*` aliases remain temporarily. | Avoid a risky all-screen cutover while generated semantic adapters land. | Mobile UI | Migrate consumers mode-by-mode, then remove aliases. |
| 2026-09-05 | `QrCodeSvg` paints literal `#000000` on `#ffffff` instead of semantic tokens. | A QR code must stay dark-on-light in both themes and on paper to remain scannable; theming it would break field use. | PointFinder frontend | None — this is a permanent, machine-readable-graphic exception. |
| 2026-09-08 | Auth onboarding GLB artwork and its renderer use authored physical material/light colors and camera geometry. | Blue uniforms, yellow/navy scarves, terrain and warm lighting are illustration content, not interface/status colors. The full-viewport canvas needs geometry-aware framing around the DOM overlay. | PointFinder frontend / illustration | Retain as a scoped illustration exception; every title, control, focus state and scrim continues to use canonical semantic tokens. Reassess asset budgets on device before extending the world. |
| 2026-09-08 | The public homepage re-maps the semantic surface tokens inside `.landing-page` to a marketing palette (`dataColor.atlasCream`, `atlasCreamDeep`, `atlasEvergreen`, `atlasEvergreenDeep`, `atlasInk`, `atlasMist`, `atlasMint`), and its evergreen and cream bands stay the same in both themes. | The approved editorial concept is evergreen forest, cream paper, evergreen; its illustrations are dark, and the cream band is the page's rhythm. Canonical buttons, badges and cards keep their shape and behaviour, only the scoped surface and action roles change, and nothing leaks past the homepage. | PointFinder frontend | Keep scoped to `.landing-page`; the pricing band follows the app theme. Revisit if the marketing palette becomes a second product theme. |

## 2026-09-05 — Single frontend ownership

Owner: PointFinder frontend. Canonical React primitives, Storybook and semantic
theme now live in `web/`; generators write to `web/src/generated`. Tauri embeds
the same frontend with platform-specific adapters. Existing player screens are
migrated without claiming native journey parity. Legacy Swift/Compose adapters
remain until the device rollout checklist in `docs/frontend-consolidation.md` is
complete. Resolve remaining player media/push and device UX gaps before retiring
the old platform applications.
