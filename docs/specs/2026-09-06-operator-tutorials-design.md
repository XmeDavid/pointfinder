# Operator tutorials: guided first game and a scenario library

Date: 2026-09-06
Status: approved design, not yet planned
Trunk: `master`

## Goal

Teach a new operator the product by doing, on their own real game, with coach marks that
spotlight the next action and explain what it does and what else the screen offers. The
same engine powers a library of tutorials so that new or advanced features (fixed routes,
hidden bases, future capabilities) each get a scenario file instead of new UI.

The operator surface is the browser and the Tauri shell, which serve the same `web/`
bundle. Legacy iOS and Android operator apps are on a maintenance footing and do not get a
copy of this feature.

## Decisions taken during brainstorming

| Fork | Decision |
|---|---|
| Interaction style | Coach marks on the operator's own game. Steps advance when real state changes, not on Next. |
| First run | Welcome card on the empty dashboard with Start and Skip. No auto-start. |
| Scope | A scenario engine plus a tutorials library. First scenario is the full lifecycle; two more ship after. |
| Progress storage | Server side, per account, so completion follows the operator across devices. |
| Blocking | Non-blocking. The scrim dims but never intercepts clicks. The operator can wander. |
| Automation | Steps may open a drawer tab, switch mode, or expand a panel to reveal the anchor. They never create entities or change game status. |
| Check-in methods | The tutorial adapts to the method chosen: radius step for location, download step for QR, link step for NFC with a "later" path. |
| Field walkthroughs | Base and challenge detail forms are walked field by field once, marking each as required or optional. |
| Platforms | Built once in `web/`. Desktop renders a floating bubble; below `md` it is a bottom sheet above the mobile tab bar. |

## Vocabulary

- **Scenario**: an ordered list of steps with an id, title, blurb, and entry type.
- **Step**: one anchor, one piece of copy, one completion rule, an optional `when` guard, and an optional `prepare` action.
- **Anchor**: a `data-testid` on an existing element. Anchors are the stable contract between scenarios and screens.
- **Completion kind**: `predicate` (state-driven), `click` (the anchored element received a click), or `ack` (a Next or Got it button).
- **Entry type**: `new-game` (starts on the dashboard and expects a game to be created) or `setup-game` (runs on an existing game in `setup`).

## Frontend

### Location

- Engine, store, scenarios, welcome card, library page: `web/src/features/tutorials/`.
- Canonical rendering components: `web/src/components/tour/` (`Spotlight`, `CoachBubble`, `TourPill`). They live outside `features/` because the audit script flags `backdrop-blur` in feature folders and `OverlayPanel` supplies it.

### Data model

```ts
type ScenarioId = 'first-game' | 'fixed-route' | 'exploration';

type Scenario = {
  id: ScenarioId;
  entry: 'new-game' | 'setup-game';
  steps: Step[];
};

type Step = {
  id: string;
  anchor: string | ((s: TourState) => string);      // data-testid, may depend on the selected entity id
  route?: 'dashboard' | 'workspace';
  when?: (s: TourState) => boolean;                   // omitted means always included
  prepare?: (ctx: TourActions) => void;               // reveal the anchor; never a domain action
  done:
    | { kind: 'predicate'; test: (s: TourState) => boolean }
    | { kind: 'click' }
    | { kind: 'ack' };
  copy: { title: string; body: string; aside?: string; later?: string }; // i18n keys under tutorials.*
  branchCopy?: Array<{ when: (s: TourState) => boolean; body: string }>; // first match wins
};
```

`TourState` is a selector over data the app already has: the games list, the active game
(status, `enforceBaseOrder`, `unlockTrigger`, default check-in method), bases, challenges,
teams, assignments, the readiness checks from `useReadinessChecks`, workspace mode, drawer
open state and tab, selected entity ids, the readiness panel expanded flag, and the last
successful mutation (key and timestamp). `TourActions` wraps the workspace store setters:
`setMode`, `openDrawer(tab)`, `selectBase`, `selectChallenge`, `selectTeam`,
`setReadinessExpanded`, `openSettings`.

### Engine store (`useTourStore`, Zustand, not persisted locally)

State: `activeScenario`, `stepIndex`, `paused`, `ackedSteps`, `laterSteps`, `deferredNfc`,
`startedAt`, plus a `progress` map hydrated from the server.

Rules:

1. Each render computes the effective step list by filtering steps whose `when` is false.
2. The current step completes when its rule is met. `predicate` steps complete when the test
   passes. `click` steps complete on a capture-phase click whose target is inside the
   anchored element. `ack` steps complete when the bubble's button is pressed.
3. After completing, the engine advances and then skips forward past any later `predicate`
   steps that already pass, so an operator who did things out of order is not asked to
   redo them. `ack` and `click` steps are never auto-skipped.
4. If the anchor is not in the DOM or is fully off screen, the bubble collapses to a
   `TourPill` ("Tutorial · step 4 of 12"). Tapping the pill runs the step's `prepare`.
5. Close on the bubble sets `paused`. The pill remains with Resume. Paused scenarios show
   as in progress in the library.
6. Every change to `stepIndex`, `paused`, or completion writes through to the server,
   debounced by 500 ms, with the last write flushed on unmount and logout.
7. Route changes do not end a scenario. A `new-game` scenario started on the dashboard
   follows the operator into the workspace of the game created after `startedAt`.

### Rendering

- `Spotlight`: a portalled, full-viewport SVG whose mask is the viewport minus a rounded
  rectangle over the anchor rect, padded 8 px. The rect is tracked with the same approach as
  the floating menu in `web/src/components/ui/dropdown-menu.tsx` (bounding rect,
  `ResizeObserver`, capture-phase scroll and resize listeners). `pointer-events: none`
  throughout so the scrim never blocks.
- `CoachBubble`: built on `OverlayPanel`. Header shows a thin progress bar (no visible step counter; the counter is the bar's accessible label) and the step title,
  body copy, optional aside rendered as a quieter paragraph, an optional "I'll do it later"
  secondary action, and a primary Next or Got it for `ack` steps. Close control always
  present. Focus moves to the bubble when a step starts and returns to the anchor on close.
  Escape pauses. On desktop it is positioned beside the anchor with collision flipping
  against the viewport and the safe-area insets. Below `md` it is a bottom sheet with the
  mobile tab bar height reserved.
- `TourPill`: the collapsed state, bottom center, above the mobile tab bar.
- Motion uses the standard duration and easing tokens and `useReducedMotion` from
  `motion/react`; with reduced motion the spotlight and bubble appear without transition.
- A new layer `z-[70]` sits above the drawer (`z-50`) and portalled menus (`z-[60]`) and
  below toasts (`z-[100]`). The layer is documented in `docs/visual-system/tokens.md`.
- Mount point: a `TourHost` rendered in the pathless root route element next to
  `PushIntake` and `TagIntake` in `web/src/App.tsx`, so it has router context on every
  authenticated route. It renders nothing when no scenario is active or the user is not an
  operator.

### Groundwork changes in existing screens

- `data-testid` added to the IconRail mode buttons (`mode-build`, `mode-command`,
  `mode-review`, `mode-results`), the dashboard `EmptyState` (`dashboard-empty-state`),
  the base route editor button (`arrange-route-btn`), and the enforce-base-order switch
  (`enforce-base-order-switch`). E2E helpers switch to these IDs where they currently use
  aria labels.
- The readiness panel `expanded` flag moves from local state in `ReadinessIndicator` to the
  workspace store so `prepare` can expand it.
- The settings panel gains an imperative open through the workspace store if it does not
  already have one.
- The query client's mutation cache is subscribed once in `TourHost` to record the last
  successful mutation key and time. No DTO changes.
- Revert dialog copy in `GameSettingsPanel` is corrected: erasing progress archives
  submissions, check-ins, and events rather than deleting them.

### Welcome card

Shown on the dashboard when the personal workspace has zero games and there is no progress
row for `first-game`. One sentence of what the tutorial does, estimated time, Start, and
Skip for now. Start begins the scenario. Skip writes a `skipped` row and hides the card for
good; the scenario stays available in the library. The card is not shown in an org
workspace.

### Tutorials library

- Route `/tutorials` inside `AppLayout` behind `AuthGuard`.
- Entry points: "Tutorials" in the avatar menu, the welcome card, and the finish step of
  every scenario.
- One card per scenario: title, blurb, step count, status badge (Not started, In progress,
  Completed, Skipped), and Start, Resume, or Restart. Restart resets the row.
- `setup-game` scenarios: when launched from a workspace whose game is in `setup`, that
  game is used. Otherwise the server creates a fresh practice game for the scenario (see
  "Practice games" below) and the run starts inside it. There is no game picker: a
  tutorial never touches a game the operator made for a real event.
- States: loading skeleton, error with retry, and the normal list. There is no empty state
  because scenarios are bundled.

## Scenarios

### `first-game` (entry: `new-game`, the operator creates the practice game through the real dialog)

Field walkthroughs run once, on the first base and the first challenge. Later bases and
challenges skip them.

| # | Anchor | Copy gist | Completion |
|---|---|---|---|
| 1a | `create-game-btn` | Every event starts as a game in setup. Tap New Game. | predicate: the button was tapped, or a new game already exists |
| 1b | `game-name-input` (inside the create dialog; the phone sheet moves to the top so the dialog's buttons stay reachable) | Name it and create it. | predicate: a game created after `startedAt` exists and the route is its workspace |
| 2 | `readiness-indicator` | The map is the canvas; this pill lists what is missing before going live. | ack |
| 3 | `map-wrapper` | Tap the map where players should go, then choose Place base here. | predicate: bases ≥ 1 |
| 4a | `base-name-input` | Name it after the place; players see this. Prefilled. | predicate: name non-empty |
| 4b | `base-description-input` | Optional context for players. | ack |
| 4c | `base-lat-input` | Set by where you tapped; adjust by dragging the marker or typing. | ack |
| 4d | `base-checkin-method` | NFC tag, QR code, or GPS. | predicate: method chosen |
| 4e | `base-checkin-radius` | GPS only. Too small and players struggle; too large and bases overlap. | when: method is location. predicate: radius valid and no overlap |
| 4f | `base-qr-print` | QR only. Download or print and place it at the location. | when: method is QR. click |
| 4g | `nfc-write-{id}` on native, `tab-nfc` on browser | NFC only. Write the tag from the app. Not now? The Tags tab lists every unlinked base and the readiness pill reminds you. Later button. | when: method is NFC. predicate: linked, or "later" sets `deferredNfc` |
| 4h | `visibility-visible` | Visible bases show on the player map; hidden ones suit exploration games (see that tutorial). | ack |
| 4i | `link-challenge-btn` | You can pin one challenge to a base; assignments come after challenges exist. | ack |
| 4j | `save-base-btn` | Save. | predicate: base save mutation succeeded after 4a |
| 5 | `map-wrapper` | Add a second base so there is a route. | predicate: bases ≥ 2 |
| 6 | `new-entity-btn` (prepare: open drawer tab `challenges`) | Challenges are what players answer. At least one per base. | predicate: challenges ≥ 1 |
| 6a | `challenge-title-input` | What players see in their list. Required. | predicate: non-empty |
| 6b | `answer-type-{text,file,none}` | Text answer, file upload, or none (just reach the base). | predicate: type chosen |
| 6c | `challenge-content` | The task. Formatting and team variables like `{{key}}` are supported. Required. | predicate: non-empty |
| 6d | `challenge-description` | Optional short summary shown in lists. | ack |
| 6e | `auto-validate-toggle` | On: the app checks the answer. Off: you review in Review mode. | ack |
| 6f | `correct-answer-input` | Only with auto-validate on. | when: auto-validate on and type is text. predicate: non-empty |
| 6g | `points-input` | Scoring weight. Players never see scores. | ack |
| 6h | `completion-content` | Shown to the team after they complete this challenge. Optional. | ack |
| 6i | `location-bound-toggle` | On: answerable only at its base. Off: answerable anywhere once unlocked. | ack |
| 6j | `operator-notes` | Private notes, never shown to players. | ack |
| 6k | `save-challenge` | Save. | predicate: challenge save mutation succeeded after 6a |
| 7 | `new-entity-btn` (challenges tab) | One more so every base has a challenge. | predicate: challenges ≥ bases |
| 8 | `auto-assign-btn` (prepare: open drawer tab `bases`) | Link challenges to bases. Auto-assign gives every base every challenge; or link per base. | predicate: every base has a fixed challenge or ≥ 1 assignment |
| 9 | `new-entity-btn` (prepare: open drawer tab `teams`) | Players join as teams. | predicate: teams ≥ 1 |
| 10 | `team-join-code` | Players join from the app with this code; the QR button prints it. | ack |
| 11 | `go-live-btn` (prepare: expand the readiness panel) | All checks pass. Going live assigns challenges and opens the game. Branch copy when `deferredNfc` and a base is still unlinked: the tag is the remaining blocker; link it from the Tags tab or switch the base to QR. | predicate: status is live |
| 12 | `mode-command` | Command watches teams, Review handles submissions, Results is scoring. | ack |
| 13 | `revert-to-setup-btn` (prepare: open settings) | Need a change? Back to setup. Keep progress or erase it; history is archived either way. | predicate: status is setup |
| 14 | `challenge-item-{firstId}` (prepare: open drawer tab `challenges`) | Edit anything, for example a challenge's points. | predicate: a challenge save succeeded after step 13 completed |
| 15 | `go-live-btn` (prepare: expand readiness) | Go live again. | predicate: status is live |
| 16 | none | Done. Keep the practice game as a real game, or delete it. Links to the library for fixed routes and exploration games. | keep or delete (see Practice games), marks completed |

Step 11 also has branch copy when readiness is not all green: it names the failing check
and points to the pill's checklist.

### `fixed-route` (entry: `practice-game`, seeded with three bases, three assigned challenges and a team)

| # | Anchor | Copy gist | Completion |
|---|---|---|---|
| 1 | `enforce-base-order-switch` (prepare: open settings) | Teams must visit bases in a set order. Bases unlock one at a time. | predicate: `enforceBaseOrder` true |
| 2 | `unlock-trigger-{current}` | What unlocks the next base: checking in, or completing the challenge. Either is fine. | ack |
| 3 | `arrange-route-btn` (prepare: open drawer tab `bases`) | Drag bases into order. | predicate: route editor open |
| 4 | `base-route-editor` | The order players will follow. Readiness now checks that every base has a place in the route. | ack |
| 5 | `readiness-indicator` | Route checks appear here. | ack |
| 6 | none | Done. Keep or delete the practice game. | keep or delete, marks completed |

### `exploration` (entry: `practice-game`, seeded with three visible bases, two assigned challenges and a team)

| # | Anchor | Copy gist | Completion |
|---|---|---|---|
| 1 | `base-item-{firstId}` (prepare: open drawer tab `bases`) | Pick a base to hide. | predicate: a base is selected |
| 2 | `visibility-hidden` | Hidden bases are not on the player map until found. Location bases still geofence. | predicate: selected base hidden |
| 3 | `challenge-content` (prepare: open the linked or first challenge) | Use a challenge's completion text to give the clue to the hidden base. | ack |
| 4 | `readiness-indicator` | Hidden bases still count for readiness and still need a check-in method. | ack |
| 5 | none | Done. Keep or delete the practice game. | keep or delete, marks completed |

### `unlock-chain` (entry: `practice-game`, seeded: one visible trailhead, five hidden bases, every challenge pinned and location bound, the chain set except its first link)

| # | Anchor | Copy gist | Completion |
|---|---|---|---|
| 1 | `map-wrapper` | Only the trailhead shows; hidden bases appear as challenges are completed. | ack |
| 2 | `challenge-item-{trailhead}` | Open the trailhead's challenge. | click or selected |
| 3 | `unlocks-base-{bridge}` (new "Reveals bases" editor in the challenge form) | Reveal the old bridge. | predicate: toggle pressed |
| 4 | `save-challenge` | Save the link. | predicate: the challenge's `unlocksBaseIds` contains the bridge |
| 5 | `challenge-item-{bridge}` | A fork: one challenge reveals two bases. | ack |
| 6 | `challenge-item-{tower}` | A bonus behind them, the summit ahead. | ack |
| 7 | none | Done; keep or delete. | ack |

### `different-path` (entry: `practice-game`, seeded: three bases, three challenges, two teams, nothing assigned)

| # | Anchor | Copy gist | Completion |
|---|---|---|---|
| 1 | `map-wrapper` | Same bases, opposite starts, same challenge order. | ack |
| 2 | `assignment-grid-btn` | Open Assignments. | predicate: grid present |
| 3 | `assignment-cell-{A}-{falcons}` | Falcons A→1, B→2, C→3. | predicate on assignments |
| 4 | `assignment-cell-{C}-{lions}` | Lions C→1, B→2, A→3. | predicate on assignments |
| 5 | `assignment-grid` | Nothing enforces a physical order; brief the teams (or use a fixed route). | ack |
| 6 | none | Done; keep or delete. | ack |

### `variable-outcome` (entry: `practice-game`, seeded: a complete game whose first challenge is pinned to the old mill)

| # | Anchor | Copy gist | Completion |
|---|---|---|---|
| 1 | `map-wrapper` | One completion text, a different destination per team. | ack |
| 2 | `challenge-item-{pinned}` | Open the pinned challenge. | click or selected |
| 3 | `variable-key-input` | Name the variable `next`. | predicate: value is `next` |
| 4 | `add-variable-btn` | Add it. | predicate: value fields present |
| 5 | `variable-value-next-{team}` | One value per team. | predicate: every team's value non-empty |
| 6 | `save-variables-btn` | Save the values. | predicate: `variables:challenge` succeeded after step 5 |
| 7 | `completion-content` | Type `{{next}}` in the post-completion text. | predicate: the text contains `next` |
| 8 | `save-challenge` | Save. | predicate: `challenge:update` succeeded after step 7 |
| 9 | none | Done; keep or delete. | ack |

Revisions of 2026-09-07 (afternoon): the step counter is a progress bar; `revert` is a tap
followed by `revert-choice` (keep or erase); `edit` is opening the challenge, then
`edit-location-bound`, then `edit-save`; deleting or replacing a practice game never asks.

## Practice games (decided 2026-09-07)

A tutorial is a safe place. It never runs on a game the operator made for a real event; it
runs on a **practice game** that the operator can throw away or keep at the end. This also
lets a free-tier operator at their active-game limit do any tutorial, because a practice
game does not count against that limit.

Rules, all enforced by the server:

- **Marked.** `games.tutorial_scenario` (nullable, the scenario id) marks a practice game;
  `games.tutorial_expires_at` is when it ends itself. Both come back on `GameResponse` as
  `tutorialScenario` / `tutorialExpiresAt`.
- **Created only through a tutorial.** `POST /api/users/me/tutorials/{scenarioId}/practice-game`
  creates and seeds one for a `practice-game` scenario and binds it to the progress row
  (`status: in_progress`, `currentStep: null`, `gameId`). For `first-game`, the operator
  creates the game through the normal dialog; the client adds `tutorialScenario: "first-game"`
  to `POST /api/games`, and the server honours it only while the user's `first-game` row is
  `in_progress`. Any other value, or no such run, creates a normal game under the normal rules.
- **One at a time.** Creating a practice game while the user already owns one that has not
  ended is rejected with 409 `TUTORIAL_PRACTICE_GAME_EXISTS`. Restart from the library deletes
  the current practice game after a confirm, then creates a new one. Redoing a tutorial is
  never punished: no cooldown.
- **Outside the quota.** Practice games are excluded from the personal active-game count and
  from `enforceActiveGameLimit`, which `createGame` now calls for normal games (it existed but
  had no caller; it stays behind `app.quota.enforcement-enabled`).
- **Worthless as a second event.** A practice game accepts **one player** in total, so the
  operator can open the player app and see the player side, and nothing more. Teams, bases and
  challenges are not capped: the lessons need them.
- **Time-boxed.** 24 hours after creation the scheduler ends a practice game that is still in
  setup or live (same loop as date-based auto-end). Ended games do not count against quota and keep their content;
  "keep" applies the quota whether or not the game has ended, and reviving an ended
  personal game is checked against the quota too, so ending is never a side door.
- **Keep or delete.** `POST /api/games/{id}/keep` clears the marker and the expiry and applies
  the normal active-game quota (a free operator at the limit gets 400
  `QUOTA_ACTIVE_GAMES_EXCEEDED` and the client sends them to `/billing`). Delete is the
  existing `DELETE /api/games/{id}`. Both need game access. A kept game has no marker, so
  restart and expiry can never touch it.
- **Seeding** happens in the practice endpoint, per scenario, near a point the client passes
  (`lat`/`lng`, the operator's map centre; a fixed fallback otherwise). `first-game` seeds
  nothing. Names are English on the server; the client passes the localized game name.

Client surface: a "Practice game · ends in 23 h · Keep / Delete" banner in the workspace top
bar and a "Practice" badge on the dashboard card; the closing step of every scenario offers
Keep and Delete (Delete does not confirm — a practice game is disposable — navigates to the dashboard, completes the run; Keep
converts, or navigates to `/billing` on a quota error, and completes the run). The player
join screen shows a dedicated message for `TUTORIAL_PRACTICE_GAME_PLAYER_LIMIT`.

## Backend

### Migration `V62__practice_games.sql`

```sql
ALTER TABLE games
  ADD COLUMN tutorial_scenario   VARCHAR(64),
  ADD COLUMN tutorial_expires_at TIMESTAMPTZ;
CREATE INDEX idx_games_tutorial_expires_at ON games (tutorial_expires_at)
  WHERE tutorial_expires_at IS NOT NULL;
```

### Migration `V61__user_tutorial_progress.sql`

```sql
CREATE TABLE user_tutorial_progress (
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id  VARCHAR(64) NOT NULL,
  status       VARCHAR(16) NOT NULL,   -- in_progress | completed | skipped
  current_step VARCHAR(64),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scenario_id)
);
```

No row means not started. The scenario id is validated against a server-side allowlist so
unknown ids are rejected with 400.

### API

Two endpoints only. Restart is expressed through PUT, so no DELETE is needed.

- `GET /api/users/me/tutorials` returns `[{ scenarioId, status, currentStep, startedAt, completedAt }]`.
- `PUT /api/users/me/tutorials/{scenarioId}` with `{ status, currentStep }` upserts and
  returns the row. `completed` sets `completed_at`. Restart is a PUT with
  `status: in_progress` and `currentStep: null`.

- `POST /api/users/me/tutorials/{scenarioId}/practice-game` with `{ name, lat?, lng? }`
  creates, seeds and binds a practice game; returns the `GameResponse`. 409 when one exists.
- `POST /api/games/{id}/keep` clears the practice marker under the normal quota.

Operator role required. Entity, repository, service, and controller mirror
`OperatorNotificationSettings`. Progress rows are not audited: they are UI preference.
Practice-game creation, keep and delete go through the game services and carry whatever
audit those already have.

### Follow-up, not in this wave

Game status transitions are not written as activity events; only a log line exists. The
tutorial teaches go-live and revert, so an audit event for status changes is worth adding,
but it touches the activity event model and is tracked separately.

## Localization

All copy under a new `tutorials.*` block in `packages/i18n/src/locales/{en,pt,de}.json`,
added together. The key contract for scenario titles and the welcome card is added to
`contractKeys` in `locales.test.ts`. Copy is written for German length: bubble body wraps,
buttons never clip, and the bubble has a max height with internal scroll.

## Testing

- **Vitest**: engine (advance on predicate, skip-ahead, `when` filtering, click and ack
  completion, pause and resume, follow-into-workspace for `new-game`, debounce and flush of
  progress writes); scenario definitions (every static anchor is in a maintained list of
  known test IDs, every copy key exists in all three locales); `Spotlight` geometry and
  off-screen detection; `CoachBubble` states (default, long German copy, with aside, with
  later action, reduced motion, dark theme, mobile sheet); welcome card visibility rules;
  library card states and picker.
- **Storybook**: stories for `Spotlight`, `CoachBubble`, `TourPill`. A "Tutorials" section
  in the dev visual harness and a row in `docs/visual-system/preview-matrix.md`.
- **Offline Playwright** (`web/e2e/tutorials.spec.ts`): walk `first-game` through step 11
  with mocked routes on the `browser` and `native-shell` projects, asserting the bottom
  sheet at 390 px and that the scrim never blocks a click.
- **Full-stack Playwright** (`e2e/web/positive/tutorial-first-game.spec.ts`, `@smoke`):
  run the whole first scenario with QR bases, including revert and second go-live, and
  assert the server row ends `completed`.
- **Gradle**: controller and service tests for list, upsert, restart, unknown scenario id,
  and cross-user isolation.
- **Checks**: web typecheck, lint, focused Vitest, `make design-system-check`,
  `make design-system-audit` (advisory), i18n test, `make test-backend-docker` focused.

## Documentation updated in the same change

- `docs/visual-system/tokens.md`: the `z-[70]` tour layer.
- `docs/visual-system/component-inventory.md`: `Spotlight`, `CoachBubble`, `TourPill`.
- `docs/visual-system/patterns.md`: "Guided tutorial" pattern and the non-blocking rule.
- `docs/api-reference.md`: the two endpoints.
- `docs/business-logic.md`: tutorial progress storage and the first-run rule.

## Build order

1. Engine, store, `Spotlight`, `CoachBubble`, `TourPill`, `TourHost`, groundwork test IDs and
   the readiness expanded state hoist. Vitest and stories.
2. `first-game` scenario, welcome card, i18n, offline Playwright.
3. Backend table and endpoints, client sync, tutorials library page, full-stack smoke.
4. `fixed-route` and `exploration` scenarios.
5. Revert dialog copy fix and doc updates land with the wave that touches each file.
