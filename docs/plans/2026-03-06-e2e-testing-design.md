# E2E Testing System Design

## Goal

End-to-end testing system that runs against production (`pointfinder.pt`), testing API contracts, web UI, and mobile UI (iOS + Android) to guarantee feature parity across all platforms.

## Stack

- **Playwright Test** — API tests + web browser tests (TypeScript)
- **Maestro** — iOS + Android UI flows (YAML)
- Single `e2e/` folder at project root, self-contained
- Manual trigger via `run.sh` (v1 is local/manual only — no CI)

## Project Structure

```
e2e/
├── package.json              # Playwright + dependencies
├── playwright.config.ts      # Config (base URL, timeouts, artifacts)
├── .env                      # Credentials (gitignored)
├── .env.example              # Template
├── run.sh                    # Manual trigger: ./run.sh [smoke|api|web|ios|android|all|parity|cleanup]
├── scenarios.json            # Parity registry (authoritative source of truth)
│
├── shared/
│   ├── api-client.ts         # Typed HTTP client wrapping all endpoints
│   ├── auth.ts               # Token access via .runtime/<runId>.tokens, login/join helpers
│   ├── fixtures.ts           # Test data factories with run ID
│   ├── setup.ts              # Runner-owned: create main game + write .runtime/<runId>.json
│   ├── cleanup.ts            # Runner-owned: deletes ALL resources tracked by run context
│   ├── config.ts             # Read env vars, base URL
│   ├── run-context.ts        # Read/write .runtime/<runId>.json (IDs only, no secrets)
│   └── wait-helpers.ts       # Retry/poll helpers for eventual consistency assertions
│
├── .runtime/                 # Generated per-run context (gitignored)
│   └── <runId>.json          # IDs + join codes only — NO tokens
│
├── artifacts/                # Test failure diagnostics (gitignored)
│   ├── traces/               # Playwright traces on failure
│   ├── screenshots/          # Playwright + Maestro screenshots
│   └── logs/                 # Maestro logs, redacted run context snapshots
│
├── api/                      # Pure API tests (Playwright test runner)
│   ├── positive/
│   │   ├── auth.spec.ts
│   │   ├── game-lifecycle.spec.ts
│   │   ├── base-crud.spec.ts
│   │   ├── challenge-crud.spec.ts
│   │   ├── assignment-linking.spec.ts
│   │   ├── team-and-players.spec.ts
│   │   ├── submission-flow.spec.ts
│   │   ├── monitoring.spec.ts
│   │   ├── token-refresh.spec.ts
│   │   ├── export-import.spec.ts
│   │   ├── operator-notification.spec.ts
│   │   └── live-broadcast.spec.ts
│   └── negative/
│       ├── auth-boundaries.spec.ts
│       ├── player-isolation.spec.ts
│       ├── business-rules.spec.ts
│       └── invalid-operations.spec.ts
│
├── web/                      # Playwright browser tests
│   ├── positive/
│   │   ├── game-setup.spec.ts
│   │   ├── base-management.spec.ts
│   │   ├── challenge-management.spec.ts
│   │   ├── assignment-linking.spec.ts
│   │   ├── team-management.spec.ts
│   │   ├── submission-review.spec.ts
│   │   ├── monitoring.spec.ts
│   │   ├── export-import.spec.ts
│   │   ├── operator-notification.spec.ts
│   │   └── live-broadcast.spec.ts
│   └── negative/
│       ├── unauthorized-navigation.spec.ts
│       └── business-rules.spec.ts
│
├── mobile/                   # Maestro flows
│   ├── shared/               # Cross-platform flow definitions
│   │   ├── positive/
│   │   │   ├── operator-login.yaml
│   │   │   ├── game-create.yaml
│   │   │   ├── base-create-edit.yaml
│   │   │   ├── challenge-create-edit.yaml
│   │   │   ├── assignment-linking.yaml
│   │   │   ├── team-create.yaml
│   │   │   ├── player-join.yaml
│   │   │   ├── player-progress.yaml
│   │   │   ├── player-submit.yaml
│   │   │   ├── submission-review.yaml
│   │   │   ├── monitoring.yaml
│   │   │   ├── game-activate.yaml
│   │   │   ├── edit-entities.yaml
│   │   │   ├── delete-entities.yaml
│   │   │   ├── export-import.yaml
│   │   │   └── operator-notification.yaml
│   │   └── negative/
│   │       ├── invalid-login.yaml
│   │       └── business-rules.yaml
│   ├── ios/
│   │   └── selectors.yaml    # iOS accessibilityIdentifier mappings
│   ├── android/
│   │   └── selectors.yaml    # Android testTag mappings
│   └── assets/               # Test files for upload scenarios
│       └── test-photo.jpg
│
└── README.md
```

## Environment Configuration

```
# e2e/.env
BASE_URL=https://pointfinder.pt
OPERATOR_EMAIL=<test-operator-email>
OPERATOR_PASSWORD=<test-operator-password>
IOS_APP_ID=com.prayer.pointfinder
ANDROID_APP_ID=com.prayer.pointfinder
```

## Test Scenarios

### Positive

| ID  | Scenario                                   | API | Web | Mobile |
| --- | ------------------------------------------ | --- | --- | ------ |
| P1  | Operator login                             | Y   | Y   | Y      |
| P2  | Create game                                | Y   | Y   | Y      |
| P3  | Create bases (2-3 with coords)             | Y   | Y   | Y      |
| P4  | Create challenges (all answer types)       | Y   | Y   | Y      |
| P5  | Link assignments (uniform + team-specific) | Y   | Y   | Y      |
| P6  | Create teams with join codes               | Y   | Y   | Y      |
| P7  | Player joins team via join code            | Y   | -   | Y      |
| P8  | Activate game                              | Y   | Y   | Y      |
| P9  | Player sees progress                       | Y   | -   | Y      |
| P10 | Player submits text answer                 | Y   | -   | Y      |
| P11 | Operator reviews submission                | Y   | Y   | Y      |
| P12 | Leaderboard updates with points            | Y   | Y   | Y      |
| P13 | Edit game/base/challenge                   | Y   | Y   | Y      |
| P14 | Delete base/challenge                      | Y   | Y   | Y      |
| P15 | Token refresh                              | Y   | -   | -      |
| P16 | Game export/import                         | Y   | Y   | Y      |
| P17 | Monitoring dashboard + activity            | Y   | Y   | Y      |
| P18 | Operator sends notification                | Y   | Y   | Y      |
| P19 | Public live broadcast view                 | Y   | Y   | -      |

### Negative

| ID  | Scenario                                    | API | Web | Mobile |
| --- | ------------------------------------------- | --- | --- | ------ |
| N1  | Invalid login (wrong password) returns 401  | Y   | Y   | Y      |
| N2  | Expired token rejected                      | Y   | -   | -      |
| N3  | Player can't access other games             | Y   | -   | -      |
| N4  | Player can't submit to unassigned challenge | Y   | -   | -      |
| N5  | Invalid join code fails gracefully          | Y   | -   | -      |
| N6  | Duplicate submission blocked (idempotency)  | Y   | -   | -      |
| N7  | Cannot delete game with active status       | Y   | Y   | -      |
| N8  | Empty/invalid payloads return 400           | Y   | -   | -      |
| N9  | Fixed challenge can't be fixed on two bases | Y   | Y   | Y      |
| N10 | Challenges must be >= bases count           | Y   | Y   | Y      |

> **Note on N3/N4/N5 mobile coverage**: These are API-enforced boundaries. The mobile apps don't expose UI to attempt cross-game access or unassigned submissions — the app simply doesn't show those options. Testing them at the API layer is sufficient. If future mobile UI changes expose these paths, coverage should be added.

## Fixture Model

### Two-tier game strategy

The setup phase and test scenarios must not conflict. Operator setup scenarios (P2-P6, P8) need to actually test creation flows, so the shared setup cannot pre-consume them.

**1. Main game (created by `setup.ts`, persistent for the run)**
- Pre-built with bases, challenges, assignments, teams, and activated
- Used **only** for cross-layer continuity scenarios that depend on existing game state: P7 (player join), P9-P12 (player progress/submit, operator review, leaderboard), P17-P19 (monitoring, notifications, broadcast)
- Never mutated destructively

**2. Layer-local throwaway games (created and destroyed within each spec)**
- Operator setup flow tests (P2-P6, P8) each create their own game to test the actual creation UI/API — this is where "create game", "create base", etc. are genuinely exercised
- Edit tests (P13) create a throwaway game, edit it, verify changes
- Delete tests (P14) create throwaway entities to delete
- Export/import tests (P16) export the main game, import as a new throwaway game
- All negative/destructive tests (N7, N9, N10, etc.) create isolated fixtures
- Each spec is responsible for its own setup and teardown, tracking created resources in `createdGameIds`

### Resource tracking

`run-context.ts` tracks **all** created resources:
```json
{
  "runId": "e2e-2026-03-06T14-30-45",
  "mainGameId": "uuid",
  "createdGameIds": ["uuid-main", "uuid-imported", "uuid-negative-1"],
  "bases": [...],
  "challenges": [...],
  "teams": [{ "id": "uuid", "name": "Team Alpha", "joinCode": "..." }],
  "assignments": [...]
}
```

Cleanup deletes **every game in `createdGameIds`**, not just the main one.

## Secret Handling

Tokens are stored in a **separate ephemeral file**, never archived:
- `.runtime/<runId>.json` stores only IDs, names, join codes — no tokens
- `.runtime/<runId>.tokens` stores operator/player tokens — gitignored, deleted by cleanup, never archived
- Artifact archives use the `.json` file only (no secrets)
- The `.tokens` file is needed because `setup.ts` and test layers run as separate processes (no shared memory)

## Execution Model

### Runner script

```bash
./run.sh smoke            # Quick validation: login → create → join → submit → review → cleanup
./run.sh smoke:web        # Web smoke with API-assisted player setup
./run.sh smoke:ios        # iOS smoke (login + create game)
./run.sh smoke:android    # Android smoke (login + create game)
./run.sh api              # Setup → API tests → teardown
./run.sh api:positive     # Setup → API positive only → teardown
./run.sh web              # Setup → web UI tests → teardown
./run.sh ios              # Setup → Maestro iOS flows → teardown
./run.sh android          # Setup → Maestro Android flows → teardown
./run.sh all              # Setup → API → web → iOS → Android → teardown
./run.sh parity           # Check scenario coverage across platforms
./run.sh cleanup          # Delete orphaned E2E games from crashed runs
```

**Every command that runs tests follows the same lifecycle:** `setup.ts` → test layer(s) → `cleanup.ts`. The runner owns this via shell `trap` — cleanup always runs, even on failure. There is no Playwright `globalSetup`/`globalTeardown`.

`smoke` runs a minimal critical path (@smoke-tagged specs/flows only):
- `./run.sh smoke` (default) — API only: auth.spec.ts, submission-flow.spec.ts, monitoring.spec.ts
- `./run.sh smoke:web` — web operator checks (login, create game, verify monitoring) with API-assisted player setup (join + submit via API, web verifies submission appears for review)
- `./run.sh smoke:ios` / `./run.sh smoke:android` — mobile operator login + create game

`all` means **all four layers** serially — API, web, iOS simulator, Android emulator — sharing the same main game. If only one mobile target is available, run the corresponding layer commands separately (for example `./run.sh api`, `./run.sh web`, `./run.sh ios`).

### Serial execution — explicit decision

All tests run **serially**. This avoids race conditions from parallel mutation, flaky ordering failures, and unnecessary game proliferation on prod. Trade-off: slower runs, but reliable and safe.

### Pipeline order

The runner (`run.sh`) owns the full lifecycle — not Playwright, not Maestro.

```
1. run.sh: npx tsx shared/setup.ts
   - Generate unique run ID (e.g., "e2e-2026-03-06T14-30-45")
   - Login as test operator
   - Create main game named "E2E <runId> Main", track in createdGameIds
   - Create 3 bases, 4 challenges, assignments, 2 teams
   - Activate game
   - Write IDs (no secrets) to .runtime/<runId>.json
   - Write operator + player tokens to .runtime/<runId>.tokens (gitignored, not archived)

2. run.sh: execute selected layer(s)
   - npx playwright test --project=api  (reads .runtime/<runId>.json)
   - npx playwright test --project=web  (reads .runtime/<runId>.json)
   - maestro test --env-file=...        (reads .runtime/<runId>.json)
   (Each layer reads the same .runtime context)
   (Setup flow specs P2-P6/P8 create their own throwaway games)
   (Destructive/negative specs create their own throwaway fixtures)
   (All throwaway game IDs appended to createdGameIds via run-context)

3. run.sh: trap → npx tsx shared/cleanup.ts
   - Runs via shell trap (always executes, even on failure)
   - Deletes ALL games in createdGameIds (cascades child entities)
   - Archives redacted run context to artifacts/
   - Removes .runtime/<runId>.tokens
```

### Run context handoff

Setup creates two files:

**`.runtime/<runId>.json`** — IDs and metadata (no secrets, safe to archive):
```json
{
  "runId": "e2e-2026-03-06T14-30-45",
  "mainGameId": "uuid",
  "createdGameIds": ["uuid"],
  "gameName": "E2E e2e-2026-03-06T14-30-45 Main",
  "bases": [{ "id": "uuid", "name": "Base A" }],
  "challenges": [{ "id": "uuid", "title": "Challenge 1" }],
  "assignments": [{ "id": "uuid", "baseId": "...", "challengeId": "..." }],
  "teams": [{ "id": "uuid", "name": "Team Alpha", "joinCode": "..." }]
}
```

**`.runtime/<runId>.tokens`** — secrets (gitignored, deleted in cleanup, never archived):
```json
{
  "operatorToken": "...",
  "refreshToken": "...",
  "playerTokens": {}
}
```

- **Playwright tests** read both files via `shared/run-context.ts` in `beforeAll`
- **Maestro flows** receive IDs via `--env` flags injected by `run.sh` (e.g., `maestro test --env GAME_NAME="E2E e2e-..." flow.yaml`). Maestro flows that need authenticated API calls (e.g., player join setup) use the app's own login UI — no token injection needed.
- **`run.sh` generates a Maestro env file** from `.runtime/<runId>.json` for convenience

### Production safety

- Game names always prefixed with `"E2E "` + unique run ID
- `cleanup.ts` only deletes games that:
  1. Are owned by the e2e operator account (matches `OPERATOR_EMAIL`)
  2. Have names starting with `"E2E "`
- All created resources tracked in `createdGameIds` — import-created games, negative test fixtures, etc.
- Standalone cleanup: `./run.sh cleanup` finds orphaned E2E games from crashed runs
- Teardown runs in a `finally` block so it executes even on test failures

### Artifacts and diagnostics

On failure, the system captures:
- **Playwright**: trace files (`.zip`), screenshots, video recordings → `artifacts/traces/`, `artifacts/screenshots/`
- **Maestro**: screenshots, flow logs → `artifacts/screenshots/`, `artifacts/logs/`
- **Run context**: redacted copy of `.runtime/<runId>.json` → `artifacts/logs/`

Configured in `playwright.config.ts`:
```ts
use: {
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
}
```

### Wait helpers for eventual consistency

`shared/wait-helpers.ts` provides:
```ts
// Poll an API endpoint until condition is met or timeout
waitForCondition(fn: () => Promise<boolean>, { timeout: 10_000, interval: 500 })

// Specific helpers
waitForLeaderboardUpdate(gameId, teamId, expectedPoints)
waitForSubmissionStatus(gameId, submissionId, expectedStatus)
waitForActivityEvent(gameId, eventType)
```

Used for assertions that depend on websocket broadcasts, background processing, or eventual consistency.

## Testability Instrumentation

Stable selectors are critical — the app is localized in 3 languages (EN/PT/DE), so text-based selectors will break.

### Required changes per platform

**Web (React)** — add `data-testid` attributes:
- Login form: `data-testid="login-email"`, `data-testid="login-password"`, `data-testid="login-submit"`
- Game list: `data-testid="create-game-btn"`, `data-testid="game-card-{id}"`
- Entity forms: `data-testid="base-name-input"`, `data-testid="challenge-title-input"`, etc.
- Navigation: `data-testid="nav-games"`, `data-testid="nav-teams"`, etc.

**iOS (SwiftUI)** — add `.accessibilityIdentifier()`:
- Login: `accessibilityIdentifier("login-email")`, `accessibilityIdentifier("login-submit")`
- Game list, entity forms, navigation — same naming convention as web

**Android (Jetpack Compose)** — add `Modifier.testTag()`:
- Login: `testTag("login-email")`, `testTag("login-submit")`
- Game list, entity forms, navigation — same naming convention as web

### Naming convention

All platforms use identical identifiers: `<context>-<element>` (e.g., `login-email`, `game-create-btn`, `base-name-input`). This allows Maestro shared flows to reference the same IDs.

### Language for testing

All test runs force locale to **EN** for selector stability:
- Web: Playwright sets `locale: 'en'` in browser context
- iOS: Maestro `--device-locale=en`
- Android: Maestro `--device-locale=en`

> **Note**: Forcing EN validates that the EN locale works, but does not validate language switching itself. Localization validation (switching between EN/PT/DE and verifying translations) is a separate concern and can be added as a future scenario if needed.

## Mobile Environment

### What's tested
- All operator CRUD flows (games, bases, challenges, teams, assignments)
- Player join, progress viewing, text submission
- Operator submission review, notifications, and monitoring
- Game export/import
- Login/auth flows

### What's explicitly excluded (hardware-dependent)
- **NFC scanning** — requires physical tags, not simulatable
- **Camera/photo capture** — simulator camera is unreliable
- **GPS location** — no location simulation in Maestro (we skip location-bound checks)
- **Push notifications** — no FCM/APNs on simulators

### Session management
- Operator and player are different accounts
- Maestro flows that switch roles (operator → player) use `clearState` between flows
- Player flows use a separate app launch with player join (no auth state carryover)

## Parity Enforcement

- `scenarios.json` is the **authoritative registry** — lists every scenario ID with required layers
- Each spec/flow **declares its scenario IDs** explicitly:
  - Playwright: `// @scenarios P1, P2` comment at top of spec file
  - Maestro: `# @scenarios P1` comment in YAML flow header
- `run.sh parity` reads these tags (not just filenames) and cross-checks against `scenarios.json`
- Missing implementations **fail the parity check**
- CLAUDE.md enforces updating `scenarios.json` when adding new features

## Shared API Client

`shared/api-client.ts` provides typed methods mirroring actual backend DTOs:

```ts
// Auth
client.login(email, password) -> { accessToken, refreshToken, user }
client.refreshToken(refreshToken) -> { accessToken, refreshToken, user }
client.playerJoin(joinCode, name) -> { playerToken, playerId, teamId, gameId }

// Games
client.createGame({ name, description, ... }) -> GameResponse
client.getGame(gameId) -> GameResponse
client.updateGame(gameId, { ... }) -> GameResponse
client.updateGameStatus(gameId, status) -> void
client.deleteGame(gameId) -> void
client.exportGame(gameId) -> GameExportJson
client.importGame(exportJson) -> GameResponse

// Bases
client.createBase(gameId, { name, lat, lng, ... }) -> BaseResponse
client.updateBase(gameId, baseId, { ... }) -> BaseResponse
client.deleteBase(gameId, baseId) -> void

// Challenges
client.createChallenge(gameId, { title, answerType, points, ... }) -> ChallengeResponse
client.updateChallenge(gameId, challengeId, { ... }) -> ChallengeResponse
client.deleteChallenge(gameId, challengeId) -> void

// Assignments
client.createAssignment(gameId, { baseId, challengeId, teamId? }) -> AssignmentResponse
client.getAssignments(gameId) -> AssignmentResponse[]
client.deleteAssignment(gameId, assignmentId) -> void

// Teams
client.createTeam(gameId, { name, color }) -> TeamResponse
client.deleteTeam(gameId, teamId) -> void

// Submissions (player context)
client.submitAnswer(gameId, { baseId, challengeId, answer }) -> SubmissionResponse
client.getProgress(gameId) -> ProgressResponse

// Submissions (operator context)
client.getSubmissions(gameId) -> SubmissionResponse[]
client.reviewSubmission(gameId, submissionId, { status, feedback, points }) -> void

// Monitoring
client.getDashboard(gameId) -> DashboardResponse
client.getLeaderboard(gameId) -> LeaderboardResponse
client.getActivity(gameId) -> ActivityResponse[]

// Notifications (actual DTO: { message: string, targetTeamId?: UUID })
client.sendNotification(gameId, { message, targetTeamId? }) -> void
client.getNotifications(gameId) -> NotificationResponse[]
```

## CI Rollout Strategy

**v1 is manual-only.** No CI integration.

Future CI plan (not in scope for v1):
- `workflow_dispatch` GitHub Action for on-demand runs
- API + web tests can run in CI (headless Chromium)
- Mobile tests stay local/manual (require simulator/emulator)
- Nightly scheduled run against prod as a smoke check

## CLAUDE.md Rule Addition

```markdown
## E2E Testing

When implementing new features or modifying existing ones, add corresponding e2e tests in `e2e/`:
- API tests in `e2e/api/` for any new or changed endpoints
- Web UI tests in `e2e/web/` for any new or changed operator-facing UI
- Maestro flows in `e2e/mobile/` for any new or changed mobile screens
- Include both positive (happy path) and negative (error/boundary) cases
- Use `shared/api-client.ts` for test setup/teardown — do not call fetch directly
- Update `e2e/scenarios.json` when adding new scenarios to keep the parity registry authoritative
- Add `data-testid` (web), `accessibilityIdentifier` (iOS), `testTag` (Android) for any new interactive elements
- Destructive tests (delete, import) must create their own throwaway fixtures — never mutate the main game destructively
```
