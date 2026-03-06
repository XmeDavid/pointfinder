# E2E Testing

End-to-end test suite for PointFinder. Covers the full stack: API (Playwright), web UI (Playwright), and mobile (Maestro).

## Prerequisites

- Node.js 18+
- [Playwright](https://playwright.dev) — installed via `npm install`
- [Maestro CLI](https://maestro.mobile.dev) — for mobile flows
- iOS Simulator (Xcode) or Android Emulator — for mobile tests

## Setup

```bash
cd e2e
cp .env.example .env
# Fill in BASE_URL, operator credentials, and other values
npm install
npx playwright install chromium
```

## Running Tests

All commands go through the `run.sh` entry point from the `e2e/` directory.

| Command | Description |
|---|---|
| `./run.sh smoke` | API smoke test — critical path only |
| `./run.sh smoke:web` | Web smoke test |
| `./run.sh smoke:ios` | iOS smoke test (login + create game) |
| `./run.sh smoke:android` | Android smoke test (login + create game) |
| `./run.sh api` | Full API test suite |
| `./run.sh api:positive` | API positive tests only (excludes `@negative`) |
| `./run.sh web` | Web UI tests |
| `./run.sh ios` | iOS Maestro flows |
| `./run.sh android` | Android Maestro flows |
| `./run.sh all` | Everything: API + web + iOS + Android |
| `./run.sh parity` | Check scenario coverage across layers |
| `./run.sh cleanup` | Delete orphaned E2E games from the server |

All commands except `parity` and `cleanup` run the full setup/teardown lifecycle automatically.

## Architecture

### Two-tier fixture model

- **Main game** — created once by `setup.ts` at the start of a run and shared across all layers (API, web, mobile). Suitable for read and non-destructive tests.
- **Throwaway games** — created per-test for destructive operations (delete, status changes, etc.). Each test is responsible for its own teardown.

### Runner-owned lifecycle

`run.sh` calls `shared/setup.ts` before any tests, which creates the shared game and writes run state to `.runtime/`. On exit (success or failure), `shared/cleanup.ts` deletes all games created during the run.

### Cross-layer continuity

API, web, and mobile tests share the same main game via the `.runtime/` state files. This means a base created by the API suite is visible when the web suite runs against the same game.

### .runtime/ directory

Holds JSON state files scoped to the current run (game IDs, team codes, etc.). This directory is gitignored and recreated on each `./run.sh` invocation.

## Test Structure

```
e2e/
├── api/
│   ├── positive/          # API positive tests (Playwright)
│   └── negative/          # API negative / error-case tests (Playwright)
├── web/
│   ├── positive/          # Web UI positive tests (Playwright)
│   └── negative/          # Web UI negative tests (Playwright)
├── mobile/
│   ├── shared/            # Maestro flows shared across iOS and Android
│   ├── ios/               # iOS-specific selectors and overrides
│   └── android/           # Android-specific selectors and overrides
├── shared/                # Infrastructure shared by all layers
│   ├── api-client.ts      # Typed API helpers
│   ├── auth.ts            # Token management
│   ├── cleanup.ts         # Teardown script
│   ├── config.ts          # Environment config
│   ├── fixtures.ts        # Playwright fixtures
│   ├── parity-check.ts    # Scenario coverage checker
│   ├── run-context.ts     # .runtime/ state reader/writer
│   ├── setup.ts           # Setup script
│   └── wait-helpers.ts    # Polling / retry utilities
├── scenarios.json         # Parity registry
├── playwright.config.ts   # Playwright configuration
├── run.sh                 # Entry point
└── .env.example           # Environment variable template
```

## Adding New Tests

1. Create a spec file in the appropriate directory (`api/positive/`, `web/negative/`, etc.).
2. Add a `@scenarios` tag at the top of the file listing the scenario IDs it covers:
   - TypeScript: `// @scenarios P3, P5`
   - YAML (Maestro): `# @scenarios P3`
3. Update `scenarios.json` if needed to mark the new layer as covered.
4. Run `./run.sh parity` to verify the registry matches reality.

## Scenario Tags

Test files may also carry Playwright `@`-tags in test names for filtering:

| Tag | Meaning |
|---|---|
| `@smoke` | Critical path — run on every deploy |
| `@negative` | Negative / error-case test |

Example: `test('login with bad password @negative', ...)`

## Scenario Registry

`scenarios.json` lists every scenario and which layers (`api`, `web`, `mobile`) are required to cover it. Use `./run.sh parity` to generate a coverage table and exit non-zero if any required coverage is missing.

## Artifacts

| Path | Contents |
|---|---|
| `e2e/artifacts/` | Screenshots, videos, and trace files from test runs |
| `e2e/playwright-report/` | Playwright HTML report (`npx playwright show-report`) |
| `e2e/.runtime/` | Run-specific state files (gitignored) |
