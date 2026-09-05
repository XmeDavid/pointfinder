# One frontend, two deployment targets

`web/` owns PointFinder's React application: routes, operator and player features,
components, theme, Storybook, and frontend tooling. `mobile/` owns the Tauri CLI
and native shell. There is no copied or symlinked frontend in `mobile/`.

## Ownership

- `web/src/App.tsx`: shared route graph and operator layouts. Existing web URLs
  remain valid; `/operator/games/:gameId` redirects to `/game/:id`.
- `web/src/features/player/`: the former Tauri player UI, available in both targets.
  `/join`, `/list`, `/base/:baseId`, and `/tag/*` share the same implementation.
- `web/src/components/`, `hooks/useToast.ts`, and `theme/`: canonical UI previously
  owned by `components/core`. Storybook lives in `web/.storybook/`.
- `web/src/platform/`: browser/native transport, persistence, location, NFC, and
  incoming links. Feature modules do not import Tauri plugins directly.
- `packages/api/`: typed client and contracts used by player/game-core code.
  `web/src/lib/api/` retains the established operator API wrappers and Axios error
  contract; they use the same platform transport and configuration. These wrappers
  are compatibility code within the single app, not a second frontend.
- `packages/game-core/`: reusable game rules, progress and offline replay engine.
- `packages/i18n/`: the only translation source. Existing operator keys remain
  unchanged; `playerApp` groups player copy to avoid collisions.
- `design-system/`: token sources and generators. Generated frontend adapters go
  to `web/src/generated/`; Swift/Compose adapters remain maintained for the old apps.

## Commands

Run `bun install` at the repository root. There is one Bun lockfile.

```sh
bun run dev                         # browser app, port 5173
bun run build                       # web/dist
bun run build:native                 # web/dist-native
bun run storybook                    # component explorer, port 6006
bun run --cwd mobile tauri android dev
bun run --cwd mobile tauri ios dev   # macOS/Xcode
```

Tauri invokes `web`'s native commands and embeds `web/dist-native`. Its Vite server
uses port 1420 and `TAURI_DEV_HOST` for devices. Browser and mobile releases can
ship independently; mobile startup uses embedded assets rather than a hosted URL.

`VITE_API_URL` always means the API root, including `/api`. Browser default: `/api`.
Native default: `https://pointfinder.pt/api`. For another native environment, set
`VITE_API_URL` in `web/.env.native.local` to an absolute URL. `VITE_WS_URL` optionally
overrides the STOMP URL/path. Keep native HTTP allowlists aligned with that host.

Build the web container from the repository root:

```sh
docker build -f web/Dockerfile .
```

Existing external hosting settings that still name `web-admin/Dockerfile` must
be changed to `web/Dockerfile`, with repository-root build context. This change
updates repository CI/Compose configuration; it does not deploy production or
modify settings stored in an external hosting service.

## Sessions and offline behavior

Browser operators retain HttpOnly refresh cookies and in-memory access tokens.
Native operators persist refresh credentials in the secure-store plugin; previous
Tauri operator sessions migrate from the `auth` key. Player credentials stay
separate from operator credentials, and player routes cannot enter operator UI.

The browser queue and player snapshots use IndexedDB; Tauri uses SQLite. Queue
records and cached snapshots are scoped to a player. Existing queued actions and
snapshots migrate while restoring their existing player session. A different
player cannot replay those actions. Clearing a session does not silently discard
unsent work. Requests retain their original idempotency keys.

Production browser builds precache the application shell, emitted assets and
bundled fonts. Previously loaded player snapshots and durable actions can survive
an offline reload. API responses are not stored by the service worker. Map tiles
and uncached media still require connectivity. A new browser shell activates when
tabs using the previous version close; native builds do not register this worker.

Browser realtime uses authenticated STOMP CONNECT frames (the raw mobile endpoint
requires an HTTP Authorization header). Player subscriptions are limited to the
game topic and their own team's sanitized submission events. Native players retain
the raw mobile websocket; native operators use the shared operator STOMP logic
through a native socket adapter. Backend authorization remains authoritative.

## Verification and rollout

```sh
bun run --cwd web typecheck
bun run --cwd web lint
bun run --cwd web test
bun run build
bun run build:native
bun run --cwd web build-storybook
(cd web && bun x playwright install chromium)
bun run --cwd web test:e2e
make design-system-check
make design-system-audit
```

The self-contained browser smoke tests use API fixtures and exercise both build
artifacts, role routing and an offline/reload/reconnect submission. The existing
`e2e/` suite remains the backend-integrated journey suite. Browser execution of the
native artifact verifies its frontend, not native IPC or device capability parity.

`ios-app/` and `android-app/` remain available for maintenance and rollback. This
consolidation does not claim full parity with those apps. The subsequent native
parity work adds durable media submissions, notification/settings journeys and
native capability integration; see [platform validation](native-platform-validation.md)
for current implementation and verification status.
Before replacing store releases, validate NFC read/write and cold start, QR intake,
permissions, background/foreground transitions, secure session restoration, SQLite
replay across process death, media uploads, and audited operator actions on actual
iOS and Android devices. iOS signing/build checks require the Mac toolchain.

## Initial consolidation validation recorded on 2026-09-05

This records the first consolidation pass. The subsequent
[native platform validation](native-platform-validation.md) supersedes its test
counts and Android device availability.

- Frontend: 636 existing/migrated/platform tests passed in the full suite, plus
  the added legacy-storage migration test passed separately (637 total).
- Shared packages: 21 API, 31 game-core and 3 translation tests passed.
- Built-artifact E2E: 9 tests passed; the browser-only offline test is excluded
  from the native artifact project. Additional responsive/localized screenshots
  passed at 390, 768, 1280 and 1600 pixels, including both themes and EN/PT/DE.
- All workspace typechecks, frontend lint, browser/native production builds,
  Storybook build, design-system freshness and advisory audit passed. The audit
  reported 10 advisory findings.
- Tauri Rust check and Android debug APK build passed with the shared frontend.
- Android device execution was unavailable because the attached phone's ADB
  authorization was pending. iOS build/device verification requires macOS.
- Local Docker image verification was blocked by Docker socket permissions; the
  repository CI now includes the root-context web image build.
