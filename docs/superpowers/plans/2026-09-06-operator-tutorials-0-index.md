# Operator tutorials — plan index

Spec: `docs/specs/2026-09-06-operator-tutorials-design.md` (read it fully before any phase).
Repo: `/Users/xmedavid/dev/dbvnfc`, trunk `master`. Plans and specs are never committed.

Phases run in order; each phase is one atomic commit on `master` (phase 3's backend half is
independent and may be built first if convenient, but it still lands as its own commit):

1. `2026-09-06-operator-tutorials-1-engine.md` — `feat(web): tutorial engine, spotlight and coach bubble`
2. `2026-09-06-operator-tutorials-2-first-game.md` — `feat(web): guided first-game tutorial with welcome card`
3. `2026-09-06-operator-tutorials-3-progress-library.md` — `feat(tutorials): per-account progress and tutorials library`
4. `2026-09-06-operator-tutorials-4-scenarios.md` — `feat(web): fixed-route and exploration tutorials`

After phase 2 and before phase 3, progress lives only in memory: a reload brings the welcome
card back. That is expected and goes away in phase 3.

Working-tree caveat: `docs/specs/*` and `docs/superpowers/plans/*` are untracked on purpose.
Stage phase commits by explicit path.

---

# Shared interface contract — operator tutorials

Every phase MUST use exactly these names. Do not invent alternatives. If a name here turns
out to be impossible, **append** the deviation to "Contract deviations" at the bottom of this
file and use the new name consistently. That section is already populated with every deviation
the four phase plans declared; no phase replaces it.

## File layout (web)

```
web/src/features/tutorials/
  types.ts            Scenario, Step, StepDone, TourState, TourActions, FieldReading, ScenarioId, TutorialStatus, TutorialProgress
  dom.ts              readAnchorField(testId), pressedIn(groupTestId), anchorElement(testId), isAnchorVisible(el)
  engine.ts           effectiveSteps, isStepDone, advance, stepIndexOf (pure, no React)
  store.ts            useTourStore
  mutationLog.ts      subscribeMutationLog(queryClient), MUTATION_KEYS
  useTourState.ts     hook that assembles TourState from queries + workspace store + tour store + DOM
  useTourActions.ts   hook returning TourActions bound to the workspace store and router
  TourHost.tsx        mounted once in App.tsx root route; renders Spotlight/CoachBubble/TourPill
  anchors.ts          KNOWN_ANCHORS: readonly string[] (static anchors; template anchors listed as prefixes)
  scenarios/
    index.ts          SCENARIOS: Partial<Record<ScenarioId, Scenario>>, SCENARIO_ORDER,
                      registerScenario(s), getScenario(id), scenarioList(): Scenario[]
    firstGame.ts      (phase 2)
    fixedRoute.ts     (phase 4)
    exploration.ts    (phase 4)
  WelcomeCard.tsx     (phase 2)
  testState.ts        makeTourState(overrides) — the one shared TourState factory for all tests
  progressSync.ts     (phase 3) useProgressHydration(), useProgressWriteThrough()
  TutorialsPage.tsx   (phase 3) route /tutorials
  ScenarioCard.tsx    (phase 3)
  SetupGamePicker.tsx (phase 3)
web/src/components/tour/
  useAnchorRect.ts    tracks a DOMRect for a testid (ResizeObserver + MutationObserver +
                      scroll capture + resize + a 600 ms settle loop)
  Spotlight.tsx       portalled SVG mask, pointer-events none
  CoachBubble.tsx     OverlayPanel-based bubble; desktop floating / mobile bottom sheet
  TourPill.tsx        collapsed state
  *.stories.tsx       one story file per component
web/src/lib/api/tutorials.ts                       (phase 3)
web/src/hooks/queries/useTutorialProgress.ts       (phase 3)
web/src/hooks/mutations/useTutorialMutations.ts    (phase 3)
```

## Types (`web/src/features/tutorials/types.ts`)

```ts
import type { Game, Base, Challenge, Team, Assignment } from '@/types'
import type { GameMode, DrawerTab } from '@/stores/workspace'

export type ScenarioId = 'first-game' | 'fixed-route' | 'exploration'
export type ScenarioEntry = 'new-game' | 'setup-game'
export type TutorialStatus = 'in_progress' | 'completed' | 'skipped'

export interface TutorialProgress {
  scenarioId: ScenarioId
  status: TutorialStatus
  currentStep: string | null
  /** Game a `setup-game` scenario is bound to; null for `new-game` runs.
   *  Present from phase 1: the store's complete()/skip() build this row. */
  gameId: string | null
  startedAt: string
  completedAt: string | null
}

export interface FieldReading {
  present: boolean
  /** input/textarea .value; contenteditable (ProseMirror) textContent; else element textContent. Trimmed. */
  value: string
  /** aria-pressed or aria-checked parsed; null when the element carries neither. */
  pressed: boolean | null
}

export interface TourState {
  now: number
  startedAt: number
  scenarioId: ScenarioId | null
  /** Game the scenario is bound to. Set by the engine when a new-game step 1 passes, or at start for setup-game. */
  gameId: string | null
  /** Game id from the current URL (/game/:id), else null. */
  routeGameId: string | null
  isDashboard: boolean
  isNative: boolean
  /** Ids of the games that already existed when the run started; `Game` has no
   *  creation timestamp, so this is how "the game just created" is recognised. (phase 2) */
  gamesAtStart: readonly string[]
  games: Game[]
  game: Game | null
  bases: Base[]
  challenges: Challenge[]
  teams: Team[]
  assignments: Assignment[]
  readiness: { allPassed: boolean; failing: string[] }   // failing = i18n labels of failed checks
  mode: GameMode
  drawerOpen: boolean
  drawerTab: DrawerTab
  selectedBaseId: string | null
  selectedChallengeId: string | null
  selectedTeamId: string | null
  readinessExpanded: boolean
  settingsPanelOpen: boolean
  /** ms timestamp of the last successful mutation per MUTATION_KEYS key, e.g. lastSuccess['base:update']. */
  lastSuccess: Record<string, number>
  /** ms timestamp at which each step id completed in the active run. */
  stepCompletedAt: Record<string, number>
  ackedSteps: ReadonlySet<string>
  laterSteps: ReadonlySet<string>
  field: (testId: string) => FieldReading
  pressedIn: (groupTestId: string) => string | null       // testid of the aria-pressed=true child
}

export interface TourActions {
  setMode: (mode: GameMode) => void
  openDrawer: (tab: DrawerTab) => void
  selectBase: (id: string | null) => void
  selectChallenge: (id: string | null) => void
  selectTeam: (id: string | null) => void
  setReadinessExpanded: (open: boolean) => void
  setSettingsPanelOpen: (open: boolean) => void
  navigate: (to: string) => void
}

export type StepDone =
  | { kind: 'predicate'; test: (s: TourState) => boolean }
  | { kind: 'click' }
  | { kind: 'ack' }

export interface StepCopy {
  title: string     // i18n key
  body: string      // i18n key
  aside?: string    // i18n key
  later?: string    // i18n key for the secondary "I'll do it later" button; presence renders the button
}

export interface Step {
  id: string
  anchor: string | ((s: TourState) => string)
  route?: 'dashboard' | 'workspace'
  when?: (s: TourState) => boolean
  prepare?: (a: TourActions, s: TourState) => void
  done: StepDone
  copy: StepCopy
  branchCopy?: Array<{ when: (s: TourState) => boolean; body: string }>
}

export interface Scenario {
  id: ScenarioId
  entry: ScenarioEntry
  title: string     // i18n key
  blurb: string     // i18n key
  steps: Step[]
}
```

`Assignment` is the exported name in `web/src/types/index.ts:155` (`{ id, gameId, baseId,
challengeId, teamId? }`) — verified, no deviation needed.

## Engine (`engine.ts`, pure)

```ts
export function effectiveSteps(scenario: Scenario, s: TourState): Step[]      // filters by when
export function isStepDone(step: Step, s: TourState, clicked: ReadonlySet<string>): boolean
// predicate → step.done.test(s); click → clicked.has(step.id); ack → s.ackedSteps.has(step.id) || s.laterSteps.has(step.id)
export function advance(scenario: Scenario, s: TourState, clicked: ReadonlySet<string>, fromStepId: string | null): string | null
// Position is a step ID, never an index: a `when` guard can add or remove a step between two
// renders, so an index silently means a different step from one frame to the next.
// Returns the id of the first step at or after fromStepId (in effectiveSteps order) that is not
// done, skipping only predicate steps; ack and click steps are never auto-skipped.
// fromStepId null = start at the first effective step. Returns null when the scenario is finished.
// If fromStepId is no longer effective, the search resumes at the first effective step whose
// position in the raw scenario.steps array is greater than fromStepId's; an id that is in no list
// at all returns null rather than restarting from the top.
export function stepIndexOf(scenario: Scenario, s: TourState, stepId: string | null): number
// position in effectiveSteps, for "step n of m"; -1 when the id is not currently effective
export function resolveAnchor(step: Step, s: TourState): string
export function resolveBody(step: Step, s: TourState): string                 // first matching branchCopy or copy.body
```

## Store (`store.ts`, Zustand, not persisted)

```ts
interface TourStoreState {
  activeScenario: ScenarioId | null
  gameId: string | null
  gamesAtStart: string[]                         // (phase 2)
  currentStepId: string | null                   // null = at the first effective step
  paused: boolean
  startedAt: number
  ackedSteps: Set<string>
  laterSteps: Set<string>
  clickedSteps: Set<string>
  stepCompletedAt: Record<string, number>
  lastSuccess: Record<string, number>
  tick: number                                   // bumped by DOM input/change/click capture listeners
  progress: Record<ScenarioId, TutorialProgress | undefined>   // hydrated in phase 3
}
interface TourStoreActions {
  /** `stepId` starts the run at a named step — that is all Resume needs. */
  start: (scenarioId: ScenarioId, opts?: { gameId?: string; stepId?: string; gamesAtStart?: string[] }) => void
  pause: () => void
  resume: () => void
  stop: () => void                                // clears active run, keeps progress
  /** Marks the active scenario completed and clears the run. Called by TourRunner
   *  when advance() returns null. */
  complete: () => void
  /** Records a `skipped` row for a scenario that is not running (the welcome card). */
  skip: (scenarioId: ScenarioId) => void
  ack: (stepId: string) => void
  later: (stepId: string) => void
  clicked: (stepId: string) => void
  setCurrentStep: (stepId: string | null) => void
  markStepCompleted: (stepId: string, at: number) => void
  bindGame: (gameId: string) => void
  recordSuccess: (key: string, at: number) => void
  bumpTick: () => void
  setProgress: (rows: TutorialProgress[]) => void
  reset: () => void
}
export const useTourStore = create<TourStoreState & TourStoreActions>()(...)
```

`complete()` and `skip()` are the **only** two places a `TutorialProgress` row is built. No
component, effect or sync module assembles one by hand. There is no `resumeAt` and no
`pendingResumeStepId`: Resume is `start(id, { gameId, stepId })`.

## Mutation keys (`mutationLog.ts` and the existing mutation hooks)

Add `mutationKey` to these hooks and nothing else:

| Hook (file) | mutationKey | log key |
|---|---|---|
| `useCreateBase` (`hooks/mutations/useBaseMutations.ts`) | `['base', 'create']` | `base:create` |
| `useUpdateBase` | `['base', 'update']` | `base:update` |
| `useCreateChallenge` (`useChallengeMutations.ts`) | `['challenge', 'create']` | `challenge:create` |
| `useUpdateChallenge` | `['challenge', 'update']` | `challenge:update` |
| `useSetAssignments` (`useAssignmentMutations.ts`) | `['assignments', 'set']` | `assignments:set` |
| `useCreateAssignment` | `['assignments', 'create']` | `assignments:create` |
| `useUpdateGame` (`useGameMutations.ts`) | `['game', 'update']` | `game:update` |
| `useUpdateGameStatus` | `['game', 'status']` | `game:status` |
| `useCreateGame` | `['game', 'create']` | `game:create` |

```ts
export const MUTATION_KEYS = { baseCreate: 'base:create', baseUpdate: 'base:update', ... } as const
export function subscribeMutationLog(queryClient: QueryClient, record: (key: string, at: number) => void): () => void
// subscribes to queryClient.getMutationCache(); on event.type === 'updated' with mutation.state.status === 'success'
// and a mutationKey of two strings, calls record(`${k0}:${k1}`, Date.now()).
```

## Workspace store additions (`web/src/stores/workspace.ts`)

- state `readinessExpanded: boolean` (initial `false`)
- action `setReadinessExpanded: (open: boolean) => void`
- action `setSettingsPanelOpen: (open: boolean) => void`
- `ReadinessIndicator` reads/writes `readinessExpanded` from the store instead of local state.
- `useReadinessChecks` is exported from `web/src/features/build/ReadinessIndicator.tsx` and its
  summary gains `allPassed: boolean`.

## New and changed test IDs (groundwork, phase 1)

| Element | File | data-testid |
|---|---|---|
| IconRail mode buttons (desktop and mobile) | `components/layout/IconRail.tsx` | `mode-build`, `mode-command`, `mode-review`, `mode-results` |
| Dashboard empty state wrapper | `features/dashboard/DashboardPage.tsx` (pass through `EmptyState`'s new optional `data-testid` prop) | `dashboard-empty-state` |
| Base route "arrange" button | `features/build/BasesTab.tsx` | `arrange-route-btn` |
| Enforce base order switch | `features/build/GameSettingsPanel.tsx` | `enforce-base-order-switch` |
| Answer type group wrapper | `features/build/ChallengeDetail.tsx` (the `<div className="flex gap-1.5">` around line 352) | `answer-type-group` |
| Answer type buttons | `features/build/ChallengeDetail.tsx` | keep ids; add `aria-pressed={localAnswerType === at.value}` |
| Auto-validate and location-bound toggles | `ChallengeDetail.tsx` | keep ids; add `aria-pressed` |
| Visibility buttons (**phase 4**, not phase 1) | `features/build/BaseDetail.tsx` | keep ids `visibility-visible` / `visibility-hidden`; add `aria-pressed={!localHidden}` / `aria-pressed={localHidden}` |
| Welcome card | `features/tutorials/WelcomeCard.tsx` | `tutorial-welcome-card`, `tutorial-welcome-start`, `tutorial-welcome-skip` |
| Tour UI | `components/tour/*` | `tour-spotlight`, `tour-bubble`, `tour-bubble-title`, `tour-bubble-body`, `tour-next`, `tour-later`, `tour-close`, `tour-pill`, `tour-pill-resume` |
| Library | `features/tutorials/*` | `tutorials-page`, `tutorial-card-{scenarioId}`, `tutorial-start-{scenarioId}`, `tutorial-resume-{scenarioId}`, `tutorial-restart-{scenarioId}`, `setup-game-picker`, `setup-game-option-{gameId}`, `setup-game-create` |
| Avatar menu item | `components/layout/UserAvatarMenu.tsx` | `menu-tutorials` |

Already in the app; **not** added, renamed or re-declared by any phase, listed here because the
E2E specs need to pick the right one:

| Element | File | data-testid |
|---|---|---|
| `SlideDrawer` header close (rendered only when the drawer is given a `title`) | `components/layout/SlideDrawer.tsx` | `slide-drawer-close` |
| Content panel close (the drawer the tutorial opens has no `title`, so this is its only close control) | `features/build/ContentDrawer.tsx` | `drawer-close` |

E2E helper `switchWorkspaceMode` in `e2e/shared/web-helpers.ts` switches to `mode-{mode}` ids.

## Layering and rendering rules

- Tour layer class: `z-[70]`. Documented in `docs/visual-system/tokens.md` under a new "Layering" list: 30 floating bars, 40 desktop rail, 50 drawers/dialogs/mobile rail, 60 portalled menus, 70 tutorial layer, 100 toasts.
- `Spotlight` and `CoachBubble` are portalled to `document.body`. `Spotlight` root: `fixed inset-0 z-[70] pointer-events-none`, `data-testid="tour-spotlight"`, SVG with `<mask>` (white full rect, black rounded rect over the anchor rect padded 8 px, `rx` 8) filling with `var(--pf-color-surface-tourScrim)`.
- **Tour scrim token.** `color.surface.tourScrim` is a new semantic token in `design-system/tokens.json` (light `#1017124d` ≈ 30 %, dark `#00000080` = 50 %), added in phase 1 and regenerated with `make design-system-generate`. It is deliberately lighter than the modal `color.surface.scrim` (60 % / 70 %) because the tour never intercepts a click: it invites, it does not demand. The generator builds CSS names with `--pf-${path.replaceAll('.', '-')}` and does **not** kebab-case, so the variable is `--pf-color-surface-tourScrim`. Documented in `docs/visual-system/tokens.md`. Dialogs and drawers keep `--pf-color-surface-scrim`; the two are never interchanged.
- `CoachBubble` root: `fixed z-[70]`, `OverlayPanel` with `padding="md"`; `role="dialog"`, `aria-labelledby` the title id, `aria-live="polite"`. Desktop (`min-width: 768px` via `useMediaQuery` from `@/hooks/useMediaQuery` if it exists, else `window.matchMedia`): width 20rem, placed to the right of the anchor when there is room, else left, else below; clamped to safe-area insets exactly like `FloatingMenu` in `components/ui/dropdown-menu.tsx`. Mobile: `OverlayPanel shape="sheet"`, `left-0 right-0` at `bottom: calc(var(--safe-bottom) + 56px)`, max height 45dvh with internal scroll.
- Motion: `motion/react` `motion.div` with `initial/animate/exit` opacity and 8 px translate, duration from `--pf-motion-duration-standard` (200 ms), easing `cubic-bezier(0.2,0,0,1)`; when `useReducedMotion()` is true, `initial={false}` and no transition.
- **Focus:** on step change, focus `tour-bubble` — **unless** `document.activeElement` is editable (`INPUT`, `TEXTAREA`, `SELECT`, or `isContentEditable`). Most steps advance *because* of what is being typed into the anchored field, so an unconditional focus would pull the caret out of the input mid-word. Closing returns focus to the anchor element if present.
- **Escape:** pauses, but only when `ref.current?.contains(document.activeElement)`. A dialog, a menu or a combobox the operator opened owns its own Escape; the bubble sits on top of the page, not in front of it.
- Every DOM listener the engine adds is capture-phase and passive where allowed; `click` capture on `document` records `clicked(stepId)` when the target is inside the resolved anchor element.
- **Tick nudges are split by intent.** `click` and `change` are decisions and bump `tick` on the next animation frame. `input` is not: it bumps `INPUT_SETTLE_MS = 500` ms after the last keystroke (a trailing debounce, cleared on each new input), so a predicate like "the name is no longer the prefilled default" never fires on a half-typed word and the host does not re-render on every character.
- **Anchor tracking survives late and moving anchors.** `useAnchorRect` adds, on top of the `ResizeObserver` + capture-phase scroll/resize the floating menu uses: a `MutationObserver` on `document.body` (`childList`, `subtree`, `attributes` filtered to `class`, `style`, `data-testid`, `hidden`) so an anchor that mounts after `prepare` is found at all; and a re-measure loop that keeps measuring once per animation frame for `SETTLE_MS = 600` after any trigger, so a spring-animated anchor (`SlideDrawer`: damping 30, stiffness 300) is followed until it stops. Both are guarded on the API existing. Measuring is idempotent — `setTracking` bails when the geometry is unchanged — so the loop cannot run away.
- **`Step.route` is honoured on resume.** `TourRunner.handleResume` navigates before it prepares: `route: 'workspace'` with a bound `gameId` and a different `routeGameId` → `navigate('/game/' + gameId)`; `route: 'dashboard'` while not on the dashboard → `navigate('/dashboard')`. A run paused in the workspace and resumed from the dashboard would otherwise have nothing to reveal.

## i18n

All strings under a top-level `tutorials` block in `packages/i18n/src/locales/{en,pt,de}.json`,
each phase's keys added to all three locales together. Phase 1 creates the block with `common`
only; phase 2 extends the **same object** with `menu`, `welcome`, `scenarios` (all three
title/blurb pairs) and `firstGame`; phase 3 adds `library`; phase 4 adds `fixedRoute` and
`exploration`. No phase re-emits another phase's keys. Structure:

```
tutorials.menu                      "Tutorials"
tutorials.welcome.title/body/start/skip
tutorials.common.stepOf             "Step {{n}} of {{total}}"
tutorials.common.next / gotIt / later / close / resume / pillLabel ("Tutorial · step {{n}} of {{total}}")
tutorials.library.title / subtitle / start / resume / restart / status.{notStarted,inProgress,completed,skipped} / pickGame.title / pickGame.create / pickGame.empty / loadFailed
tutorials.scenarios.firstGame.title / blurb
tutorials.scenarios.fixedRoute.title / blurb
tutorials.scenarios.exploration.title / blurb
tutorials.firstGame.<stepId>.title / body / aside? / later? / branch.<name>?
tutorials.fixedRoute.<stepId>.title / body
tutorials.exploration.<stepId>.title / body
```

`contractKeys` in `packages/i18n/src/locales.test.ts` is edited **once, in phase 2**, adding
`tutorials.menu`, `tutorials.welcome.title`, `tutorials.scenarios.firstGame.title`,
`tutorials.scenarios.fixedRoute.title` and `tutorials.scenarios.exploration.title`. Phase 1 adds a
separate `describe('tutorial chrome vocabulary')` for its own `tutorials.common.*` keys; phases 3
and 4 add nothing to either list.

The hardcoded English revert copy in `GameSettingsPanel.tsx` ("All submissions, check-ins and
scores are deleted", "The game will resume. All progress is kept.", and the sibling strings in the
same "Game State" block) moves to `lifecycle.revert.*` keys with corrected wording: erasing
progress archives submissions, check-ins and events; nothing is deleted.

## Step ids for `first-game` (used by copy keys and by tests)

`create-game`, `orient`, `place-base`, `base-name`, `base-description`, `base-coords`,
`base-method`, `base-radius`, `base-visibility`, `base-link`, `base-save`, `base-qr`, `base-nfc`,
`second-base`, `new-challenge`, `challenge-title`, `challenge-type`, `challenge-content`,
`challenge-description`, `challenge-autovalidate`, `challenge-answer`, `challenge-points`,
`challenge-completion`, `challenge-location-bound`, `challenge-notes`, `challenge-save`,
`more-challenges`, `assign`, `new-team`, `team-code`, `go-live`, `modes`, `revert`, `edit`,
`go-live-again`, `finish`.

Ordering note that differs from the spec table: `base-qr` and `base-nfc` run after `base-save`
because they need the saved base's method; `base-radius` runs before save and uses
`pressedIn('base-checkin-method') === 'base-checkin-method-location'`.

Step ids for `fixed-route`: `enable-order`, `unlock-trigger`, `arrange`, `route`, `readiness`.
Step ids for `exploration`: `place-first`, `pick-base`, `hide`, `hide-save`, `clue`, `readiness`
(see deviations 36 and 37 below; `place-first` and `pick-base` are mutually exclusive through
their `when` guards, so an effective run is always five steps).

## Backend (phase 3)

- Migration `backend/src/main/resources/db/migration/V61__user_tutorial_progress.sql` with the
  house header comment (`-- Wave: operator tutorials.` / `-- Spec: docs/specs/2026-09-06-operator-tutorials-design.md`).
- Entity `com.prayer.pointfinder.entity.UserTutorialProgress` with `@EmbeddedId UserTutorialProgressId { UUID userId; String scenarioId }`, fields `status: TutorialStatus` (enum `IN_PROGRESS, COMPLETED, SKIPPED`, stored as VARCHAR(16) lowercase via `@Enumerated(EnumType.STRING)` is NOT lowercase, so store the enum name and map to lowercase in the DTO), `currentStep: String`, `startedAt`, `completedAt`, `updatedAt: Instant`.
- Enum `com.prayer.pointfinder.entity.TutorialStatus { IN_PROGRESS, COMPLETED, SKIPPED }`.
- Allowlist `com.prayer.pointfinder.service.TutorialProgressService.KNOWN_SCENARIOS = Set.of("first-game", "fixed-route", "exploration")`; unknown id → `BadRequestException` with `ErrorCode.VALIDATION_ERROR` (or the nearest existing validation code; record a deviation if renamed).
- DTOs: `dto/request/UpdateTutorialProgressRequest { @NotNull String status; String currentStep }` (status accepts `in_progress|completed|skipped`), `dto/response/TutorialProgressResponse { String scenarioId; String status; String currentStep; Instant startedAt; Instant completedAt }`.
- Controller `controller/TutorialProgressController` at `/api/users/me/tutorials`: `GET` → `List<TutorialProgressResponse>`, `PUT /{scenarioId}` → `TutorialProgressResponse`. Operator role via the same mechanism `UserController` uses.
- Repository `repository/UserTutorialProgressRepository extends JpaRepository<UserTutorialProgress, UserTutorialProgressId>` with `List<UserTutorialProgress> findAllByIdUserId(UUID userId)`.

## Web API client (phase 3)

```ts
// web/src/lib/api/tutorials.ts
export const tutorialsApi = {
  list: () => Promise<TutorialProgress[]>,                                   // GET /users/me/tutorials
  update: (scenarioId: ScenarioId, body: { status: TutorialStatus; currentStep: string | null; gameId?: string | null }) => Promise<TutorialProgress>,
}
// hooks
export function useTutorialProgress(options?: { enabled?: boolean })   // queryKey ['tutorials','me']
export function useUpdateTutorialProgress()    // mutationKey ['tutorials','update'], invalidates ['tutorials','me']
```

## Commands

- Web: `bun run --cwd web typecheck`, `bun run --cwd web lint`, `bun run --cwd web test -- <path>`, `bun run --cwd web test:e2e` (focused: `bun run --cwd web test:e2e -- tutorials`), `bun run --cwd packages/i18n test`, `make design-system-check`, `make design-system-audit` (advisory).
- Phase 1 only, because it ships the three story files: `bun run --cwd web build-storybook`.
- Frontend in Docker when the local toolchain is unavailable: `make test-frontend-docker`.
- Backend, whole suite: `make test-backend-docker`. The Makefile has no `TEST=` / `GRADLE_ARGS=`
  passthrough, but the compose service's command is overridable, so a focused run from the repo
  root is:
  `docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests '<FQCN>'`
- Full-stack E2E: `cd e2e && ./run.sh smoke:web`.

## Contract deviations

Merged from all four phase plans, de-duplicated and grouped by the phase that implements them.
This list is the record; the phase plans point here. **Append** during execution, never replace.

Each phase plan also keeps its own locally numbered deviation list. Those local numbers do not
match the numbering below; cross-references elsewhere in *this* file always mean the numbers below.

### Phase 1 — engine

1. `SCENARIOS` is `Partial<Record<ScenarioId, Scenario>>`, not a total record, because phase 1 ships zero scenarios — `scenarios/index.ts` also exports `SCENARIO_ORDER`, `registerScenario(scenario)`, `getScenario(id)` and `scenarioList()` (ordered by `SCENARIO_ORDER`, unregistered ids dropped), and phases 2 and 4 register at module scope rather than rewriting the object.
2. `Switch` gains a `'data-testid'?: string` prop in `web/src/components/ui/switch.tsx`, forwarded to the rendered `<button>`, because the component destructures its props explicitly and would otherwise drop `data-testid="enforce-base-order-switch"`.
3. **The run's position is a step id, not an index.** `TourStoreState.currentStepId: string | null` replaces `stepIndex: number`; `setCurrentStep(stepId)` replaces `setStepIndex(index)`; `advance(scenario, s, clicked, fromStepId): string | null` replaces the index-in/index-out signature; `stepIndexOf(scenario, s, stepId)` is added for "step n of m". A `when` guard can add or remove a step between two renders, so an index silently means a different step from one frame to the next. `start` gains an optional `stepId`, which is all Resume needs.
4. **`complete()` and `skip(scenarioId)` are store actions**, and the only two places a `TutorialProgress` row is built. `TourRunner` calls `complete()` when `advance` returns `null`; phase 2's welcome card calls `skip('first-game')`. Nothing else hand-assembles a row.
5. **`TutorialProgress.gameId: string | null` lands in phase 1, not phase 3**, because `complete()` writes it and the field cannot be optional. Phase 3 adds only the column, the DTO field and the wire plumbing behind it.
6. **`answer-type-group`** is added to the wrapper `<div>` around the three answer-type buttons in `features/build/ChallengeDetail.tsx`, so `pressedIn` has a group to read and a scenario can spotlight the whole control instead of one of its three options.
7. **New semantic token `color.surface.tourScrim`** (light `#1017124d`, dark `#00000080`) in `design-system/tokens.json`, with `make design-system-generate` run and all regenerated adapters staged. The CSS variable is `--pf-color-surface-tourScrim`: `generate.mjs` builds names with `--pf-${path.replaceAll('.', '-')}` and does **not** kebab-case, exactly as the existing `--pf-color-action-primaryStrong` shows. `design-system/decisions.md` records exceptions, not new tokens, so it gets no row.
8. **`useAnchorRect` gains a `MutationObserver` on `document.body` and a `SETTLE_MS = 600` re-measure loop.** A tour anchor usually does not exist when the step starts (`prepare` opens a drawer first) and then keeps moving while `SlideDrawer`'s spring settles; `ResizeObserver` alone finds neither case.
9. **`TourRunner` debounces input-driven advancement by `INPUT_SETTLE_MS = 500`.** `click` and `change` still bump `tick` on the next animation frame; `input` waits for a pause, so a predicate never fires on a half-typed word.
10. **`CoachBubble` does not steal focus or Escape.** The focus effect skips when `document.activeElement` is editable; the Escape handler ignores the key unless `ref.current?.contains(document.activeElement)`.
11. **`Step.route` is honoured**, in `TourRunner.handleResume`: navigate to the step's screen, then `prepare`, then `resume()`.

### Phase 2 — first-game

12. `gamesAtStart` is added to `TourStoreState` (`string[]`), to `TourState` (`readonly string[]`) and to `start(...)`, because `Game` carries no `createdAt` and the spec's "a game created after `startedAt`" is otherwise inexpressible; `freshRun()`, `initialState` and the shared `clearedRun` all carry it.
13. `TourHost`'s phase-1 bind effect is **replaced**, not supplemented: `TourRunner` binds `routeGameId` only when `scenario.entry === 'new-game'`, `gameId` is null and the route game is not in `gamesAtStart` — and phase 1's `TourHost.test.tsx` case "binds the route game when the scenario has none yet" is rewritten in the same step because its `probe` is a `setup-game` scenario.
14. A resolved anchor of `''` means "no spotlight, centred bubble": `TourHost` renders `CoachBubble` with `anchorRect={null}` and never collapses to `TourPill`, and `CoachBubble` centres itself on desktop when `anchorRect` is null. `KNOWN_ANCHORS` needs no entry for it.
15. `base-radius` tests radius validity only, not ring overlap, because `TourState.readiness.failing` carries localized labels rather than stable check ids; the copy and `aside` point at the readiness pill, which owns `readiness.locationOverlap`.
16. `base-method` completes on `{ kind: 'click' }` and `challenge-type` on `{ kind: 'ack' }`, because both controls ship with a value pre-selected (`BaseDetail` seeds `localMethod`, `ContentDrawer` creates challenges with `answerType: 'text'`) and a "value chosen" predicate would be true on arrival and silently skip the coach mark.
17. `base-name` and `challenge-title` predicates additionally reject the prefilled defaults `/^Base \d+$/` and `/^Challenge \d+$/`, for the same self-completion reason.
18. `firstGame.ts` exports `pressedAnswerType(s)`, which reads `s.pressedIn('answer-type-group')` (deviation 6) and maps the returned test id back to `'text' | 'file' | 'none'` for `challenge-answer`'s `when`.
19. `tutorials.common.*` ships in **phase 1** (`CoachBubble` and `TourPill` need it before any scenario exists); phase 2 **extends** that same `tutorials` object with `menu`, `welcome`, `scenarios` and `firstGame`, and writes title/blurb for all three scenarios — including `tutorials.scenarios.fixedRoute.*` and `tutorials.scenarios.exploration.*`, whose scenarios are phase 4 — so `contractKeys` in `packages/i18n/src/locales.test.ts` passes. `contractKeys` is edited once, in phase 2; no later phase adds to it.
20. Phase 2 appends to two phase-1 files under their existing names: `anchors.ts` (`KNOWN_ANCHORS` and `ANCHOR_PREFIXES` become supersets) and `scenarios/index.ts` (one `registerScenario(firstGame)` call).
21. **Every `prepare` that switches mode guards first:** `if (s.mode !== 'build') a.setMode('build')`. `setMode` closes the drawer and the settings panel as a side effect and `prepare` re-runs on every resume, so an unconditional call slams shut the panel the step is pointing into. `firstGame.ts` factors this into a private `buildMode(a, s)` helper.
22. **`base-nfc` opens the content drawer** (`prepare: (a, s) => { if (!s.drawerOpen) a.openDrawer('bases') }`), because its browser branch anchors `tab-nfc`, which only exists while the drawer is open.
23. **Every `first-game` step except `create-game` carries `route: 'workspace'`** (and `create-game` carries `route: 'dashboard'`), so deviation 11's resume navigation has something to act on.
24. **The welcome card's Skip calls `skip('first-game')`** (deviation 4) instead of building a `TutorialProgress` row and passing it to `setProgress`.

### Phase 3 — progress and library

25. `user_tutorial_progress` gains `game_id UUID NULL REFERENCES games(id) ON DELETE SET NULL`, and `UpdateTutorialProgressRequest` / `TutorialProgressResponse` gain `UUID gameId` — a `setup-game` scenario cannot resume without knowing its game. The client-side `TutorialProgress.gameId` is phase 1's (deviation 5), so phase 3 patches no existing literals.
26. **No resume field is added to the store.** Resume is `start(id, { gameId, stepId })` (deviation 3). There is no `resumeAt` and no `pendingResumeStepId`: nothing converts a step id to an index any more, so nothing has to be deferred to the host.
27. **`useProgressWriteThrough()` takes no argument** and `TourRunner` gains no `onStepIdChange` prop: the live step id is `useTourStore`'s `currentStepId`, which the hook reads directly. `TourHost` still mounts both sync hooks (a Skip or a `completed` row must reach the server when no run is active). The store cannot compute the effective step list, so `currentStepId` is written as it stands; it is `null` only until `TourRunner`'s first render resolves the position.
28. **A row is recorded as synced only when its PUT resolves.** `syncedRows.set(...)` lives in the `.then()`; the `.catch()` drops the scenario's entry so the next change retries. Recording at scheduling time would let one dropped request silently lose the operator's position for the rest of the session. Hydration still marks rows synced directly, so it never echoes back.
29. `CreateGameDialog` gains `onCreated?: (game: Game) => void`; when provided it replaces the navigate-to-`/game/:id` behaviour so `SetupGamePicker` can bind the new game itself. The dashboard call site passes nothing and is unchanged.
30. New error codes `TUTORIAL_SCENARIO_UNKNOWN` and `TUTORIAL_STATUS_UNKNOWN` are added under a new "Tutorials" group in `ErrorCode.java`; the contract's `ErrorCode.VALIDATION_ERROR` does not exist.
31. The two endpoints are documented in `docs/api-reference.md` §15 "Users & Invites", not in a REST "Operator/Web Client" area — that heading belongs to §12 WebSocket.
32. `docs/business-logic.md` gains a top-level `## 9. Operator Onboarding and Tutorials` plus its Table-of-Contents entry, and phase 2's `### Onboarding: the guided first game` subsection is **moved** out of section 1 into it as `### The guided first game`, so onboarding lives in exactly one place. Phase 4 appends to §9.
33. The full-stack `@smoke` spec enters through `/tutorials` and `tutorial-restart-first-game`, not the welcome card: `e2e/shared/api-client.ts` cannot register a fresh operator (`InviteResponse` hides the invite token) and the shared E2E operator always owns games, so the zero-games card is not reliably visible. Welcome-card Start/Skip stays covered by Vitest.
34. `hydrateProgress()` is the hook `useProgressHydration()` — same file, same responsibility, but it needs React Query.
35. **Going live has no confirmation dialog.** `go-live-btn` only renders once every check passes and its handler calls the status mutation directly (`web/src/features/build/ReadinessIndicator.tsx`), so the smoke's `expandReadinessAndGoLive` must **not** click `confirm-state-change-btn`. That control belongs to the settings panel's revert flow, where the smoke does still click it.

### Phase 4 — fixed-route and exploration

36. `exploration` gains a `place-first` step (`when: bases.length === 0`, anchor `map-wrapper`, done when `bases.length > 0`) so a `setup-game` run against a game with no bases has something to anchor; exactly one of `place-first` / `pick-base` is ever in `effectiveSteps`.
37. `exploration` gains a `hide-save` step, because `BaseDetail` keeps visibility in local state (`localHidden`) until `save-base-btn`: `hide` watches the button's `aria-pressed`, `hide-save` watches the persisted `Base.hidden`. Final ids: `place-first`, `pick-base`, `hide`, `hide-save`, `clue`, `readiness`.
38. `aria-pressed` on `visibility-visible` / `visibility-hidden` in `features/build/BaseDetail.tsx` lands in **phase 4**, not in phase 1's test-id groundwork, which covers only `ChallengeDetail`'s answer-type group and toggle buttons.
39. i18n gains `tutorials.fixedRoute.arrange.branch.needsTwoBases`; `branch.<name>` keys are no longer exclusive to `tutorials.firstGame.*`. The `arrange` step needs it because `arrange-route-btn` is disabled below two bases.
40. `exploration.clue` carries a `when: s.challenges.length > 0` guard the spec table does not show; a setup game with no challenges has nothing to anchor `completion-content` to.
41. Phase 4 introduces **no new anchors**: every id its scenarios point at is already in `KNOWN_ANCHORS`, and `unlock-trigger-` / `base-item-` are already in `ANCHOR_PREFIXES`, from phases 1 and 2. Task 6 verifies rather than appends, and appends only what a grep does not find.
42. The shared `TourState` test factory stays `web/src/features/tutorials/testState.ts` (phase 1); phase 4 widens it with `fields` / `pressedGroups` overrides instead of adding a second `test/tourState.ts`.

## Known product gaps found during planning

Real gaps in the product, surfaced while writing these plans. None is in scope for this wave; each
is written into scenario copy honestly rather than papered over.

- **`Challenge.unlocksBaseIds` has no operator web control.** The field exists in
  `web/src/types/index.ts`, in `web/src/lib/api/challenges.ts` and as
  `challenges.unlocksBaseToggle` in the locales, but no operator screen renders it. In the browser
  today the only way a team reaches a hidden base is by physically checking in there or by an
  operator rescue unlock-override, so the `exploration` tutorial teaches completion text as the
  clue rather than promising a mechanism.
- **Readiness has no route check, on the client or the server.** `useReadinessChecks` has no
  base-order check, and the server cannot fail one either: `BaseService.create` assigns
  `orderIndex = max(orderIndex) + 1` and `BaseOrderService.sequenceNumbers` numbers every base
  1..n, so bases are always numbered and a route is complete by construction. The `fixed-route`
  copy says so instead of claiming a check that does not exist.
- **Game status transitions are unaudited** — only a log line is written, no activity event. The
  `first-game` tutorial teaches go-live and revert, so this is worth an audit event, but it touches
  the activity event model. Already tracked as a spec follow-up ("Follow-up, not in this wave").

## Deviations recorded at landing (2026-09-07)

- Commits: 7c3c054d (engine), 24bbb441 (first game), 3b6a79e7 (progress + library, incl. local smoke harness repairs), 7ab14df1 (fixed-route + exploration, incl. `closeDrawer` tour action), e73f836e (fixes found by the real end-to-end walk).
- Engine changes not in the plan, all forced by the full-stack T1 walk: pending ticks live outside the listener effect; off-screen anchors are scrolled into view once per step; anchor clicks are recorded in the same frame as the DOM read; `advance()` runs on a state that carries the completed step's time.
- First game: `base-qr` completes when the print sheet has been opened and closed, not on the click; `go-live`, `go-live-again`, `modes`, `revert` close the drawer in prepare.
- Pre-existing bugs fixed on the way: auto-assign built a base × challenge cross product (409); base status dot said "Missing NFC" for QR/location bases; base saves were invisible until the refetch.
- Smoke T1 pauses the tour to the pill to edit the second base (switching tabs deselects the base and the bubble covers the list).
- 2026-09-07, practice games (d8145afe backend, 8e7e2ca1 web): the user decided tutorials must be a safe place — every scenario runs on a server-marked practice game (outside the quota, one player, one at a time, 24 h expiry, keep/delete on the closing card); the setup-game picker is gone. Spec section "Practice games" records the rules.
- 2026-09-07, second real walk (481da5db, a74cebf8, 48c1070f, b0b3f946): step counter replaced by a progress bar; revert is two steps (tap, then keep/erase) and "edit anything" walks challenge → location-bound toggle → save; practice games delete/replace without confirmation; three advanced scenarios (`unlock-chain`, `different-path`, `variable-outcome`) each seed their own practice game with placeholder Lisbon coordinates the user will move; `ChallengeDetail` gained the "Reveals bases" editor. The walk exposed a pre-existing backend bug: reverting to setup deleted every assignment, so a game with a location-bound challenge could never go live again (readiness ran before auto-assign); revert now keeps assignments and the web readiness list mirrors the server's location-bound rule.
