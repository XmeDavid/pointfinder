# Design-system decisions and exceptions

| Date | Decision / exception | Reason | Owner | Intended resolution |
|---|---|---|---|---|
| 2026-07-11 | Existing native `Waypoint*`, `Trail*`, and `pf*` aliases remain temporarily. | Avoid a risky all-screen cutover while generated semantic adapters land. | Mobile UI | Migrate consumers mode-by-mode, then remove aliases. |
| 2026-09-05 | `QrCodeSvg` paints literal `#000000` on `#ffffff` instead of semantic tokens. | A QR code must stay dark-on-light in both themes and on paper to remain scannable; theming it would break field use. | PointFinder frontend | None — this is a permanent, machine-readable-graphic exception. |

## 2026-09-05 — Single frontend ownership

Owner: PointFinder frontend. Canonical React primitives, Storybook and semantic
theme now live in `web/`; generators write to `web/src/generated`. Tauri embeds
the same frontend with platform-specific adapters. Existing player screens are
migrated without claiming native journey parity. Legacy Swift/Compose adapters
remain until the device rollout checklist in `docs/frontend-consolidation.md` is
complete. Resolve remaining player media/push and device UX gaps before retiring
the old platform applications.
