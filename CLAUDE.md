# PointFinder agent guide

PointFinder is one product with native platform behavior: player UI is touch-first and field-ready; operator UI is map-centered, dense, calm, recoverable, and auditable.

Before UI work, read `docs/visual-system/README.md`, `agent-checklist.md`, `component-inventory.md`, and `preview-matrix.md`. Identify the product mode. Reuse canonical components and generated semantic tokens; preserve test identifiers, permissions, localization, offline/realtime behavior, and audit boundaries.

## Architecture

- `design-system/`: canonical DTCG tokens, icon meanings, preview scenarios, generators, and audits.
- `web-admin/`: React/Tailwind; semantic classes and shared components only.
- `ios-app/`: SwiftUI; generated tokens plus native navigation, sheets, permissions, and SF Symbols.
- `android-app/`: Compose; generated tokens plus Material-native behavior.
- `backend/`: Spring Boot contracts and audited domain behavior.

Generated files say “Do not edit.” Change their source and run `make design-system-generate`. Record justified exceptions in `design-system/decisions.md`. Audits are advisory unless `STRICT=1` is explicitly requested.

## Definition of done

Cover relevant loading/empty/error/offline/queued/stale/disabled/destructive/long-copy states, both themes, accessibility, localization, and reduced motion. Run focused tests plus platform checks proportional to the change. Never claim full journey parity from a foundation-only change.

Core commands: `make design-system-check`, `make design-system-audit`, `make test-frontend-docker`, `make test-android`, `make test-ios`.

## Domain invariants

Game lifecycle is `setup → live → ended`. Going live requires bases, enough challenges, a team, linked NFC tags, valid assignments, coordinates for location-bound assignments, and complete team variables. Player actions queue offline and sync on reconnect. Rescue actions and permission boundaries remain audited. Operator and player authentication/storage stay platform-native. English, Portuguese, and German localization must remain complete.

Web changes require typecheck, lint, focused Vitest, and an E2E smoke check when user-facing. Backend changes require focused Gradle tests. Do not rename test IDs, routes, API contracts, accessibility identifiers, or Compose test tags without updating all consumers and tests.
