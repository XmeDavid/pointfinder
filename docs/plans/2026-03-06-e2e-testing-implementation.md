# E2E Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** End-to-end testing system against production, testing API, web UI, and mobile UI to guarantee feature parity.

**Architecture:** Playwright Test for API + web browser tests, Maestro for iOS/Android UI flows. Single `e2e/` folder at project root. Runner-owned lifecycle (`setup.ts` → layers → `cleanup.ts`) so all layers share the same main game. Two-tier fixture model: persistent main game for cross-layer continuity, throwaway games for operator setup and destructive tests.

**Tech Stack:** TypeScript, Playwright Test, Maestro (YAML), dotenv, uuid

---

Ref: `docs/plans/2026-03-06-e2e-testing-design.md`

## Phase 1: Project Scaffolding

### Task 1: Create e2e directory and package.json

**Files:**
- Create: `e2e/package.json`

**Step 1: Create directory and init package.json**

```bash
mkdir -p e2e
cd e2e
npm init -y
```

**Step 2: Install dependencies**

```bash
cd e2e
npm install -D @playwright/test dotenv uuid
npx playwright install chromium
```

**Step 3: Verify**

Run: `ls e2e/node_modules/.package-lock.json`
Expected: file exists

---

### Task 2: Create playwright.config.ts

**Files:**
- Create: `e2e/playwright.config.ts`

**Step 1: Write config**

```ts
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: '.',
  testMatch: ['api/**/*.spec.ts', 'web/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'https://pointfinder.pt',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en',
  },
  outputDir: './artifacts',
  projects: [
    {
      name: 'api',
      testMatch: 'api/**/*.spec.ts',
    },
    {
      name: 'web',
      testMatch: 'web/**/*.spec.ts',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
```

**Step 2: Verify**

Run: `cd e2e && npx playwright test --list 2>&1 | head -5`
Expected: no config errors (may show "no tests found" which is fine)

---

### Task 3: Create .env.example and gitignore entries

**Files:**
- Create: `e2e/.env.example`
- Modify: `.gitignore`

**Step 1: Write .env.example**

```
BASE_URL=https://pointfinder.pt
OPERATOR_EMAIL=
OPERATOR_PASSWORD=
IOS_APP_ID=com.prayer.pointfinder
ANDROID_APP_ID=com.prayer.pointfinder
```

**Step 2: Add gitignore entries**

Append to root `.gitignore`:
```
e2e/.env
e2e/.runtime/
e2e/artifacts/
e2e/node_modules/
e2e/test-results/
e2e/playwright-report/
```

**Step 3: Commit**

```bash
git add e2e/package.json e2e/package-lock.json e2e/playwright.config.ts e2e/.env.example .gitignore
git commit -m "chore(e2e): scaffold e2e testing project with Playwright"
```

---

### Task 4: Create run.sh

**Files:**
- Create: `e2e/run.sh`

**Step 1: Write runner script**

The runner owns the shared lifecycle. Setup and cleanup are **not** Playwright globals — they run as standalone scripts so all layers (Playwright and Maestro) share the same `.runtime` context.

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

CMD="${1:-help}"

# --- Lifecycle functions ---
setup() {
  echo "=== Setup: creating main game fixture ==="
  npx tsx shared/setup.ts
  # Export run ID for subcommands
  export E2E_RUN_ID=$(cat .runtime/latest-run-id)
}

cleanup_trap() {
  echo "=== Cleanup: deleting all E2E games ==="
  npx tsx shared/cleanup.ts || true
}

run_with_lifecycle() {
  setup
  trap cleanup_trap EXIT
  "$@"
}

run_api()      { npx playwright test --project=api; }
run_api_pos()  { npx playwright test --project=api --grep-invert @negative; }
run_web()      { npx playwright test --project=web; }
run_ios()      { maestro test --device-locale=en --format junit mobile/shared/; }
run_android()  { maestro test --device-locale=en --format junit mobile/shared/; }

# --- Commands ---
case "$CMD" in
  smoke)
    run_with_lifecycle npx playwright test --project=api --grep @smoke
    ;;
  smoke:web)
    run_with_lifecycle npx playwright test --project=web --grep @smoke
    ;;
  smoke:ios)
    run_with_lifecycle maestro test --device-locale=en --format junit \
      mobile/shared/positive/operator-login.yaml \
      mobile/shared/positive/game-create.yaml
    ;;
  smoke:android)
    run_with_lifecycle maestro test --device-locale=en --format junit \
      mobile/shared/positive/operator-login.yaml \
      mobile/shared/positive/game-create.yaml
    ;;
  api)
    run_with_lifecycle run_api
    ;;
  api:positive)
    run_with_lifecycle run_api_pos
    ;;
  web)
    run_with_lifecycle run_web
    ;;
  ios)
    run_with_lifecycle run_ios
    ;;
  android)
    run_with_lifecycle run_android
    ;;
  all)
    setup
    trap cleanup_trap EXIT
    run_api
    run_web
    run_ios
    run_android
    ;;
  parity)
    npx tsx shared/parity-check.ts
    ;;
  cleanup)
    npx tsx shared/cleanup.ts
    ;;
  help|*)
    echo "Usage: ./run.sh [command]"
    echo ""
    echo "Commands:"
    echo "  smoke          API smoke test (critical path)"
    echo "  smoke:web      Web smoke test (operator checks + API-assisted player)"
    echo "  smoke:ios      iOS smoke test (login + create game)"
    echo "  smoke:android  Android smoke test (login + create game)"
    echo "  api            Setup → API tests → teardown"
    echo "  api:positive   Setup → API positive only → teardown"
    echo "  web            Setup → web UI tests → teardown"
    echo "  ios            Setup → Maestro iOS flows → teardown"
    echo "  android        Setup → Maestro Android flows → teardown"
    echo "  all            Setup → API → web → iOS → Android → teardown"
    echo "  parity         Check scenario coverage across platforms"
    echo "  cleanup        Delete orphaned E2E games"
    ;;
esac
```

**Step 2: Make executable and commit**

```bash
chmod +x e2e/run.sh
git add e2e/run.sh
git commit -m "chore(e2e): add run.sh runner script"
```

---

### Task 5: Create scenarios.json

**Files:**
- Create: `e2e/scenarios.json`

**Step 1: Write registry**

Write the full scenario registry matching the design doc matrix. Each scenario lists which layers must implement it.

**Step 2: Commit**

```bash
git add e2e/scenarios.json
git commit -m "chore(e2e): add scenarios.json parity registry"
```

---

## Phase 2: Shared Infrastructure

### Task 6: shared/config.ts

**Files:**
- Create: `e2e/shared/config.ts`

**Step 1: Write config loader**

Load env vars via dotenv, export typed config object with `baseUrl`, `operatorEmail`, `operatorPassword`, `iosAppId`, `androidAppId`. Generate unique `runId` using timestamp + short uuid.

**Step 2: Verify**

Run: `cd e2e && npx tsx -e "import { config } from './shared/config'; console.log(config.runId)"`
Expected: prints a run ID string

---

### Task 7: shared/api-client.ts

**Files:**
- Create: `e2e/shared/api-client.ts`

**Step 1: Write typed HTTP client**

Wrap all endpoints mirroring actual backend DTOs. Use Playwright's `APIRequestContext` or native `fetch`. Methods:
- Auth: `login`, `refreshToken`, `playerJoin`
- Games: `createGame`, `getGame`, `getGames`, `updateGame`, `updateGameStatus`, `deleteGame`, `exportGame`, `importGame`
- Bases: `createBase`, `updateBase`, `deleteBase`
- Challenges: `createChallenge`, `updateChallenge`, `deleteChallenge`
- Assignments: `createAssignment`, `getAssignments`, `deleteAssignment`
- Teams: `createTeam`, `deleteTeam`
- Submissions (player): `submitAnswer`, `getProgress`
- Submissions (operator): `getSubmissions`, `reviewSubmission`
- Monitoring: `getDashboard`, `getLeaderboard`, `getActivity`
- Notifications: `sendNotification` (DTO: `{ message: string, targetTeamId?: string }`), `getNotifications`

**Step 2: Verify**

Run a quick smoke: login with test credentials, list games, verify 200 response.

**Step 3: Commit**

```bash
git add e2e/shared/
git commit -m "feat(e2e): add shared api-client with typed endpoint wrappers"
```

---

### Task 8: shared/auth.ts

**Files:**
- Create: `e2e/shared/auth.ts`

**Step 1: Write auth helpers**

Token access via `.runtime/<runId>.tokens` file (written by `setup.ts`, deleted by `cleanup.ts`):
- `getOperatorToken()` — read operator token from tokens file
- `getPlayerToken(playerId?)` — read player token from tokens file
- `loginAndStoreTokens()` — login with env credentials, write to tokens file (used by `setup.ts`)
- `joinPlayerAndStoreToken(joinCode, name)` — player join, append player token to tokens file

---

### Task 9: shared/fixtures.ts

**Files:**
- Create: `e2e/shared/fixtures.ts`

**Step 1: Write test data factories**

- `gameFixture(runId)` → `{ name: "E2E <runId> Main", description: "...", ... }`
- `throwawayGameFixture(runId, label)` → `{ name: "E2E <runId> <label>", ... }`
- `baseFixture(index)` → `{ name: "Base <index>", lat, lng, ... }`
- `challengeFixture(answerType)` → `{ title: "Challenge <type>", answerType, points, ... }`
- `teamFixture(index)` → `{ name: "Team <index>", color: "#..." }`

All names include the run ID so they're identifiable and cleanable.

---

### Task 10: shared/run-context.ts

**Files:**
- Create: `e2e/shared/run-context.ts`

**Step 1: Write run context manager**

- `saveRunContext(context)` — write to `.runtime/<runId>.json` (IDs and join codes only, NO tokens)
- `loadRunContext(runId)` — read from `.runtime/<runId>.json`
- `appendCreatedGameId(gameId)` — add to `createdGameIds` array
- `archiveRunContext(runId)` — copy redacted context to `artifacts/logs/`

---

### Task 11: shared/cleanup.ts

**Files:**
- Create: `e2e/shared/cleanup.ts`

**Step 1: Write safe cleanup**

Standalone script (run via `npx tsx shared/cleanup.ts`):
- If `.runtime/<runId>.json` exists: load it, iterate `createdGameIds`, delete each via API
- Standalone orphan mode (no run context): login, list all games, find any with `"E2E "` prefix owned by e2e account, delete them
- Safety: only deletes games matching BOTH conditions (owned by e2e account AND name starts with `"E2E "`)
- Removes `.runtime/<runId>.tokens` after cleanup
- Archives redacted `.runtime/<runId>.json` to `artifacts/logs/`

---

### Task 12: shared/wait-helpers.ts

**Files:**
- Create: `e2e/shared/wait-helpers.ts`

**Step 1: Write poll/retry helpers**

```ts
async function waitForCondition(
  fn: () => Promise<boolean>,
  opts: { timeout?: number; interval?: number } = {}
): Promise<void>

async function waitForLeaderboardUpdate(gameId, teamId, expectedPoints): Promise<void>
async function waitForSubmissionStatus(gameId, submissionId, expectedStatus): Promise<void>
async function waitForActivityEvent(gameId, eventType): Promise<void>
```

**Step 2: Commit all shared infrastructure**

```bash
git add e2e/shared/
git commit -m "feat(e2e): add shared infrastructure (auth, fixtures, cleanup, wait helpers, run context)"
```

---

### Task 13: Verify shared infra against prod

**Step 1: Write a quick integration smoke test**

Create a temporary test that:
1. Logs in as operator
2. Creates a throwaway game `"E2E smoke-test"`
3. Creates a base on it
4. Deletes the game
5. Verifies deletion

**Step 2: Run it**

Run: `cd e2e && npx tsx shared/smoke-verify.ts`
Expected: all steps pass, game deleted, no orphans on prod

**Step 3: Remove smoke-verify.ts and commit**

---

## Phase 3: Testability Instrumentation

### Task 14: Web — add data-testid attributes

**Files:**
- Modify: key components in `web-admin/src/`

**Step 1: Add data-testid to login form**

Find login form inputs and submit button. Add `data-testid="login-email"`, `data-testid="login-password"`, `data-testid="login-submit"`.

**Step 2: Add data-testid to game list and forms**

- Game list: `data-testid="create-game-btn"`, `data-testid="game-card-{id}"`
- Game form: `data-testid="game-name-input"`, `data-testid="game-save-btn"`
- Base form: `data-testid="base-name-input"`, `data-testid="base-lat-input"`, `data-testid="base-lng-input"`
- Challenge form: `data-testid="challenge-title-input"`, `data-testid="challenge-type-select"`
- Team form: `data-testid="team-name-input"`, `data-testid="team-color-input"`
- Assignment UI: `data-testid="assignment-base-select"`, `data-testid="assignment-challenge-select"`
- Navigation: `data-testid="nav-games"`, `data-testid="nav-teams"`, `data-testid="nav-monitoring"`
- Submission review: `data-testid="submission-approve-btn"`, `data-testid="submission-reject-btn"`
- Notification form: `data-testid="notification-message-input"`, `data-testid="notification-send-btn"`

**Step 3: Verify build**

Run: `cd web-admin && npm run build`
Expected: builds successfully

**Step 4: Commit**

```bash
git add web-admin/
git commit -m "chore(web): add data-testid attributes for e2e testing"
```

---

### Task 15: iOS — add accessibilityIdentifier

**Files:**
- Modify: key views in `ios-app/dbv-nfc-games/`

**Step 1: Add identifiers to login, game list, forms, navigation**

Same naming convention as web: `login-email`, `login-password`, `login-submit`, `create-game-btn`, `game-name-input`, `base-name-input`, `challenge-title-input`, `team-name-input`, `nav-games`, `nav-teams`, `submission-approve-btn`, `notification-message-input`, `notification-send-btn`.

**Step 2: Verify build**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -sdk iphonesimulator build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add ios-app/
git commit -m "chore(ios): add accessibilityIdentifier for e2e testing"
```

---

### Task 16: Android — add testTag

**Files:**
- Modify: key composables in `android-app/`

**Step 1: Add Modifier.testTag() to login, game list, forms, navigation**

Same naming convention: `login-email`, `login-password`, `login-submit`, `create-game-btn`, `game-name-input`, `base-name-input`, `challenge-title-input`, `team-name-input`, `nav-games`, `nav-teams`, `submission-approve-btn`, `notification-message-input`, `notification-send-btn`.

**Step 2: Verify build**

Run: `cd android-app && ./gradlew :app:assembleDebug 2>&1 | tail -5`
Expected: BUILD SUCCESSFUL

**Step 3: Commit**

```bash
git add android-app/
git commit -m "chore(android): add testTag for e2e testing"
```

---

## Phase 4: API Tests - Positive

Each spec declares `// @scenarios P1, P2, ...` at the top. Gameplay/monitoring tests use the **main game** from run context. Setup flow and destructive tests create **throwaway** fixtures.

**@smoke tags:** The following specs get `test.describe('...', { tag: '@smoke' })` for `./run.sh smoke`:
- `auth.spec.ts` (P1)
- `submission-flow.spec.ts` (P10-P12)
- `monitoring.spec.ts` (P17)

For `smoke:web`: `game-setup.spec.ts`, `submission-review.spec.ts`, `monitoring.spec.ts`.

### Task 17: Runner-owned shared/setup.ts

**Files:**
- Create: `e2e/shared/setup.ts`

**Step 1: Write setup script**

Standalone script (run via `npx tsx shared/setup.ts`) that:
1. Generates run ID, writes it to `.runtime/latest-run-id`
2. Logs in as operator
3. Creates main game with 3 bases, 4 challenges (text and file), assignments, 2 teams
4. Activates the main game
5. Saves IDs + join codes to `.runtime/<runId>.json` (no secrets)
6. Saves tokens to `.runtime/<runId>.tokens` (gitignored, deleted in cleanup)

This is **not** a Playwright globalSetup — it's a standalone script called by `run.sh` before any layer runs. This ensures Playwright, Maestro, and any future layer all share the same `.runtime` context.

**Step 2: Update playwright.config.ts**

Remove any `globalSetup`/`globalTeardown` references. Playwright tests read `.runtime/<runId>.json` and `.runtime/<runId>.tokens` via `shared/run-context.ts` in `beforeAll`.

**Step 3: Verify**

Run: `cd e2e && npx tsx shared/setup.ts && cat .runtime/latest-run-id`
Expected: prints a run ID, `.runtime/<runId>.json` exists with game data

**Step 4: Verify cleanup**

Run: `cd e2e && npx tsx shared/cleanup.ts`
Expected: main game deleted, `.runtime/<runId>.tokens` removed

**Step 5: Commit**

```bash
git add e2e/
git commit -m "feat(e2e): add runner-owned setup.ts and cleanup.ts for cross-layer lifecycle"
```

---

### Task 18: api/positive/auth.spec.ts — P1, P15

**Files:**
- Create: `e2e/api/positive/auth.spec.ts`

**Step 1: Write tests**

```
// @scenarios P1, P15
- P1: login with valid credentials → 200, verify accessToken + refreshToken returned
- P15: use refreshToken to get new accessToken → 200, verify new token works on /api/users/me
```

**Step 2: Run and verify**

Run: `cd e2e && npx playwright test api/positive/auth.spec.ts`
Expected: PASS

---

### Task 19: api/positive/game-lifecycle.spec.ts — P2, P8, P13

**Files:**
- Create: `e2e/api/positive/game-lifecycle.spec.ts`

**Step 1: Write tests**

```
// @scenarios P2, P8, P13
- P2: create throwaway game → 201, verify response has id/name
- P8: activate throwaway game → 200, verify status=active
- P13: update throwaway game name → 200, verify change persisted
- Teardown: delete throwaway game, append to createdGameIds
```

---

### Task 20: api/positive/base-crud.spec.ts — P3, P13, P14

**Files:**
- Create: `e2e/api/positive/base-crud.spec.ts`

```
// @scenarios P3, P13, P14
- P3: create base on throwaway game → 201
- P13: update base name → 200
- P14: create another base, delete it → 204
- Verify main game bases are untouched
```

---

### Task 21: api/positive/challenge-crud.spec.ts — P4, P13, P14

**Files:**
- Create: `e2e/api/positive/challenge-crud.spec.ts`

```
// @scenarios P4, P13, P14
- P4: create challenges with each supported answer type (text, file) on throwaway game
- P13: update challenge title → 200
- P14: delete throwaway challenge → 204
```

---

### Task 22: api/positive/assignment-linking.spec.ts — P5

**Files:**
- Create: `e2e/api/positive/assignment-linking.spec.ts`

```
// @scenarios P5
- Create assignment (base→challenge, uniform) on throwaway game → 201
- Create team-specific assignment → 201
- Verify assignments list returns both
```

---

### Task 23: api/positive/team-and-players.spec.ts — P6, P7

**Files:**
- Create: `e2e/api/positive/team-and-players.spec.ts`

```
// @scenarios P6, P7
- P6: create team on throwaway game → 201, verify joinCode
- P7: player join via joinCode on main game → 200, verify playerToken + teamId
```

---

### Task 24: api/positive/submission-flow.spec.ts — P10, P11, P12

**Files:**
- Create: `e2e/api/positive/submission-flow.spec.ts`

```
// @scenarios P10, P11, P12
Uses main game (already activated with teams/assignments).
- P10: player submits text answer → 201
- P11: operator reviews submission (approve with points + feedback) → 200
- P12: wait for leaderboard update, verify team points increased
```

---

### Task 25: api/positive/monitoring.spec.ts — P17

**Files:**
- Create: `e2e/api/positive/monitoring.spec.ts`

```
// @scenarios P17
Uses main game.
- GET dashboard → 200, verify game status + counts
- GET leaderboard → 200, verify team entries
- GET activity → 200, verify recent events
- GET progress → 200, verify base progress data
```

---

### Task 26: api/positive/token-refresh.spec.ts — P15

> Note: P15 is also tested in auth.spec.ts. This spec tests edge cases.

**Files:**
- Create: `e2e/api/positive/token-refresh.spec.ts`

```
// @scenarios P15
- Refresh token → new access token works
- Old access token may still work briefly (depending on backend) — just verify new one works
```

---

### Task 27: api/positive/export-import.spec.ts — P16

**Files:**
- Create: `e2e/api/positive/export-import.spec.ts`

```
// @scenarios P16
- Export main game → JSON response
- Import as new game → 201, track new gameId in createdGameIds
- Verify imported game has same bases/challenges/structure
- Teardown: imported game deleted via global cleanup
```

---

### Task 28: api/positive/operator-notification.spec.ts — P18

**Files:**
- Create: `e2e/api/positive/operator-notification.spec.ts`

```
// @scenarios P18
Uses main game.
- Send notification { message: "E2E test notification" } → 201
- Send targeted notification { message: "...", targetTeamId: teamId } → 201
- GET notifications → verify both appear
```

---

### Task 29: api/positive/live-broadcast.spec.ts — P19

**Files:**
- Create: `e2e/api/positive/live-broadcast.spec.ts`

```
// @scenarios P19
Uses main game.
- Verify broadcast/public endpoint returns game data (leaderboard, activity)
```

---

### Task 30: Run all API positive tests and commit

Run: `cd e2e && npx playwright test api/positive/`
Expected: all pass

```bash
git add e2e/api/positive/
git commit -m "feat(e2e): add API positive test specs (P1-P19)"
```

---

## Phase 5: API Tests - Negative

All negative tests create throwaway fixtures where needed.

### Task 31: api/negative/auth-boundaries.spec.ts — N1, N2

**Files:**
- Create: `e2e/api/negative/auth-boundaries.spec.ts`

```
// @scenarios N1, N2
- N1: login with wrong password → 401
- N2: request with expired/invalid token → 401
```

---

### Task 32: api/negative/player-isolation.spec.ts — N3, N4

**Files:**
- Create: `e2e/api/negative/player-isolation.spec.ts`

```
// @scenarios N3, N4
- N3: player token from main game tries to access different game's data → 403/404
- N4: player submits to challenge not assigned to their team → 400/403
```

---

### Task 33: api/negative/business-rules.spec.ts — N6, N8, N9, N10

**Files:**
- Create: `e2e/api/negative/business-rules.spec.ts`

```
// @scenarios N6, N8, N9, N10
- N6: submit with same idempotencyKey twice → second returns conflict/duplicate
- N8: POST game with empty name → 400
- N9: set challenge as fixed on base A, then try to set same challenge fixed on base B → 400/conflict
- N10: create game with more bases than challenges, verify assignment constraint
All on throwaway fixtures.
```

---

### Task 34: api/negative/invalid-operations.spec.ts — N5, N7

**Files:**
- Create: `e2e/api/negative/invalid-operations.spec.ts`

```
// @scenarios N5, N7
- N5: player join with invalid/nonexistent join code → 404
- N7: delete active throwaway game → 400/conflict
```

---

### Task 35: Run all API tests and commit

Run: `cd e2e && npx playwright test --project=api`
Expected: all pass

```bash
git add e2e/api/negative/
git commit -m "feat(e2e): add API negative test specs (N1-N10)"
```

---

## Phase 6: Web UI Tests

Web tests use Playwright browser automation. Operator setup flows (P2-P6, P8) create throwaway games via the web UI. Cross-layer continuity flows (P11, P12, P17) use the main game with API-assisted player setup.

### Task 36: web/positive/game-setup.spec.ts — P1, P2, P8

**Files:**
- Create: `e2e/web/positive/game-setup.spec.ts`

```
// @scenarios P1, P2, P8
- P1: navigate to login page, fill email/password by data-testid, submit → redirected to dashboard
- P2: click create-game-btn, fill game form, save → game appears in list
- P8: navigate to throwaway game, activate via UI → status shows active
- Teardown: delete throwaway game via API
```

---

### Task 37: web/positive/base-management.spec.ts — P3, P13, P14

**Files:**
- Create: `e2e/web/positive/base-management.spec.ts`

```
// @scenarios P3, P13, P14
On throwaway game created via API.
- P3: create base via UI → appears in list
- P13: edit base name → change persisted
- P14: delete base → removed from list
```

---

### Task 38: web/positive/challenge-management.spec.ts — P4, P13, P14

**Files:**
- Create: `e2e/web/positive/challenge-management.spec.ts`

```
// @scenarios P4, P13, P14
On throwaway game.
- P4: create challenge via UI → appears in list
- P13: edit challenge → change persisted
- P14: delete challenge → removed
```

---

### Task 39: web/positive/assignment-linking.spec.ts — P5

**Files:**
- Create: `e2e/web/positive/assignment-linking.spec.ts`

```
// @scenarios P5
On throwaway game with bases and challenges pre-created via API.
- Link challenge to base via UI → assignment visible
- Create team-specific assignment → visible
```

---

### Task 40: web/positive/team-management.spec.ts — P6

**Files:**
- Create: `e2e/web/positive/team-management.spec.ts`

```
// @scenarios P6
On throwaway game.
- Create team via UI → appears in list with join code
```

---

### Task 41: web/positive/submission-review.spec.ts — P11, P12

**Files:**
- Create: `e2e/web/positive/submission-review.spec.ts`

```
// @scenarios P11, P12
Uses main game. Player submission created via API if not already present.
- P11: navigate to submissions, approve submission with points + feedback → status changes
- P12: navigate to leaderboard, wait for update, verify points reflected
```

---

### Task 42: web/positive/monitoring.spec.ts — P17

**Files:**
- Create: `e2e/web/positive/monitoring.spec.ts`

```
// @scenarios P17
Uses main game.
- Navigate to dashboard → verify game stats visible
- Navigate to activity → verify events listed
- Navigate to leaderboard → verify team rows
```

---

### Task 43: web/positive/export-import.spec.ts — P16

**Files:**
- Create: `e2e/web/positive/export-import.spec.ts`

```
// @scenarios P16
On throwaway game.
- Export game via UI → download completes
- Import game via UI → new game appears, track in createdGameIds
```

---

### Task 44: web/positive/operator-notification.spec.ts — P18

**Files:**
- Create: `e2e/web/positive/operator-notification.spec.ts`

```
// @scenarios P18
Uses main game.
- Navigate to notifications page
- Send notification via form → appears in list
```

---

### Task 45: web/positive/live-broadcast.spec.ts — P19

**Files:**
- Create: `e2e/web/positive/live-broadcast.spec.ts`

```
// @scenarios P19
Uses main game.
- Navigate to live broadcast page → verify leaderboard/activity data visible
```

---

### Task 46: web/negative/unauthorized-navigation.spec.ts — N1

**Files:**
- Create: `e2e/web/negative/unauthorized-navigation.spec.ts`

```
// @scenarios N1
- Submit login with wrong password → error message visible
```

---

### Task 47: web/negative/business-rules.spec.ts — N7, N9, N10

**Files:**
- Create: `e2e/web/negative/business-rules.spec.ts`

```
// @scenarios N7, N9, N10
On throwaway games.
- N7: try to delete active game via UI → error shown
- N9: set challenge fixed on base A, try same on base B → error shown
- N10: violate challenge/base count constraint → error shown
```

---

### Task 48: Run all web tests and commit

Run: `cd e2e && npx playwright test --project=web`
Expected: all pass

```bash
git add e2e/web/
git commit -m "feat(e2e): add web UI test specs"
```

---

## Phase 7: Maestro Mobile Flows

Each YAML flow declares `# @scenarios P1, P2, ...` in its header comment. Operator setup flows create throwaway games. Player flows use the main game with values injected via `--env`.

### Task 49: Create selector files

**Files:**
- Create: `e2e/mobile/ios/selectors.yaml`
- Create: `e2e/mobile/android/selectors.yaml`

Map shared identifier names (e.g., `LOGIN_EMAIL`, `LOGIN_SUBMIT`, `CREATE_GAME_BTN`) to platform-specific selectors using `accessibilityIdentifier` (iOS) and `testTag` (Android).

---

### Task 50-61: Operator positive flows

**Files:** `e2e/mobile/shared/positive/`

Create each YAML flow per the design doc:
- 50: `operator-login.yaml` — P1
- 51: `game-create.yaml` — P2 (creates throwaway game)
- 52: `base-create-edit.yaml` — P3, P13
- 53: `challenge-create-edit.yaml` — P4, P13
- 54: `assignment-linking.yaml` — P5
- 55: `team-create.yaml` — P6
- 56: `game-activate.yaml` — P8
- 57: `edit-entities.yaml` — P13 (edit + restore original values)
- 58: `delete-entities.yaml` — P14 (delete throwaway entities)
- 59: `export-import.yaml` — P16
- 60: `operator-notification.yaml` — P18
- 61: `monitoring.yaml` — P17

---

### Task 62-65: Player positive flows

**Files:** `e2e/mobile/shared/positive/`

- 62: `player-join.yaml` — P7 (join main game team via code)
- 63: `player-progress.yaml` — P9 (view bases/challenges)
- 64: `player-submit.yaml` — P10 (submit text answer)
- 65: `submission-review.yaml` — P11, P12 (switch to operator, review, verify leaderboard)

---

### Task 66-67: Negative flows

**Files:** `e2e/mobile/shared/negative/`

- 66: `invalid-login.yaml` — N1 (wrong password → error message)
- 67: `business-rules.yaml` — N9, N10 (fixed challenge conflict, challenge/base count)

---

### Task 68: Test on iOS simulator

Run: `cd e2e && ./run.sh ios`
Expected: all flows pass

---

### Task 69: Test on Android emulator

Run: `cd e2e && ./run.sh android`
Expected: all flows pass

---

### Task 70: Commit mobile flows

```bash
git add e2e/mobile/
git commit -m "feat(e2e): add Maestro mobile flows for iOS and Android"
```

---

## Phase 8: Parity Check, Docs & Rules

### Task 71: Implement parity check

**Files:**
- Create: `e2e/shared/parity-check.ts`

Read `scenarios.json`. For each scenario+layer combo marked `Y`, scan the corresponding spec/flow files for `@scenarios <ID>` tags. Report missing coverage and exit non-zero if any are missing.

**Verify:** `cd e2e && ./run.sh parity` → all green

---

### Task 72: Write README

**Files:**
- Create: `e2e/README.md`

Contents:
- Prerequisites (Node, Playwright, Maestro, iOS simulator, Android emulator)
- Setup (cp .env.example .env, fill credentials, npm install)
- Running tests (all run.sh commands with descriptions)
- Smoke vs all mode (which specs get `@smoke` tags, what `all` runs)
- How to add new tests (create spec, declare @scenarios tag, update scenarios.json)
- Artifact locations
- Fixture model (main game vs throwaway)

---

### Task 73: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Add the E2E Testing section from the design doc.

---

### Task 74: Final parity + smoke verification

Run: `cd e2e && ./run.sh parity && ./run.sh smoke`
Expected: parity passes, smoke passes

```bash
git add e2e/ CLAUDE.md
git commit -m "feat(e2e): add parity check, README, and CLAUDE.md e2e rules"
```

---

## Scenario-to-Task Traceability

| Scenario | API Task | Web Task | Mobile Task |
| -------- | -------- | -------- | ----------- |
| P1       | 18       | 36       | 50          |
| P2       | 19       | 36       | 51          |
| P3       | 20       | 37       | 52          |
| P4       | 21       | 38       | 53          |
| P5       | 22       | 39       | 54          |
| P6       | 23       | 40       | 55          |
| P7       | 23       | -        | 62          |
| P8       | 19       | 36       | 56          |
| P9       | 24       | -        | 63          |
| P10      | 24       | -        | 64          |
| P11      | 24       | 41       | 65          |
| P12      | 24       | 41       | 65          |
| P13      | 19-22    | 37-38    | 57          |
| P14      | 20-21    | 37-38    | 58          |
| P15      | 18, 26   | -        | -           |
| P16      | 27       | 43       | 59          |
| P17      | 25       | 42       | 61          |
| P18      | 28       | 44       | 60          |
| P19      | 29       | 45       | -           |
| N1       | 31       | 46       | 66          |
| N2       | 31       | -        | -           |
| N3       | 32       | -        | -           |
| N4       | 32       | -        | -           |
| N5       | 34       | -        | -           |
| N6       | 33       | -        | -           |
| N7       | 34       | 47       | -           |
| N8       | 33       | -        | -           |
| N9       | 33       | 47       | 67          |
| N10      | 33       | 47       | 67          |
