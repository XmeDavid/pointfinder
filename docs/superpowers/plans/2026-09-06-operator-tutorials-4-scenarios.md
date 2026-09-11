# Operator tutorials — Phase 4: fixed-route and exploration scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two remaining tutorial scenarios — `fixed-route` (turn on base order, choose an unlock trigger, arrange the route) and `exploration` (hide a base and lead teams to it with a clue) — as data-only scenario files on the engine built in phases 1–3, with real English, Portuguese and German copy.

**Architecture:** Both scenarios are pure `Scenario` objects in `web/src/features/tutorials/scenarios/`, mirroring `firstGame.ts` from phase 2. They add no components, no store fields and no API surface: every step is an anchor `data-testid`, a `prepare` that only moves workspace UI state, and a completion rule read off `TourState`. The only production code touched outside `features/tutorials/` is one accessibility fix (`aria-pressed` on the two base visibility buttons) that the `hide` step's predicate needs.

**Tech Stack:** React 19, TypeScript, Zustand, `@pointfinder/i18n` (react-i18next), Vitest, Playwright (offline, route-mocked).

## Deviations

These deviate from the shared contract in `docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md`
or from the scenario tables in `docs/specs/2026-09-06-operator-tutorials-design.md`. **Task 8 copies
the contract items into the index file's "Contract deviations" section.**

### Contract deviations (append to the index)

1. **`exploration` gains a `place-first` step.** The contract lists exploration step ids as
   `pick-base`, `hide`, `clue`, `readiness`. A `setup-game` scenario can be started against a game
   with zero bases, where `base-item-{id}` cannot resolve. A guarded first step (`when: bases.length === 0`,
   anchor `map-wrapper`, done when `bases.length > 0`) covers that. Exactly one of `place-first` /
   `pick-base` is ever in `effectiveSteps`, so indices stay aligned when a base is created mid-run.
2. **`exploration` gains a `hide-save` step.** `BaseDetail` keeps visibility in local React state
   (`localHidden`, `web/src/features/build/BaseDetail.tsx:74`) until the operator presses
   `save-base-btn` (line 546). One step cannot both teach the toggle and observe the saved row, so
   `hide` watches the button's pressed state and `hide-save` watches the persisted `Base.hidden`.
   Final exploration ids: `place-first`, `pick-base`, `hide`, `hide-save`, `clue`, `readiness`.
3. **`aria-pressed` groundwork lands in phase 4, not phase 1.** The contract's test-id table adds
   `aria-pressed` only to `ChallengeDetail`'s answer-type and toggle buttons. `visibility-visible`
   and `visibility-hidden` in `BaseDetail.tsx` (lines 403–425) carry no `aria-pressed` or
   `aria-checked`, so `FieldReading.pressed` reads `null` for them. Task 1 adds it.
4. **i18n structure gains `tutorials.fixedRoute.arrange.branch.needsTwoBases`.** The contract shows
   `branch.<name>` keys only under `tutorials.firstGame.*`. The `arrange` step needs branch copy
   because `arrange-route-btn` is disabled below two bases (`BasesTab.tsx:133`).
5. **`exploration.clue` carries a `when` guard** (`s.challenges.length > 0`), which the spec table
   does not show. A setup game with no challenges has nothing to anchor `completion-content` to.

Not a deviation, recorded so nobody re-adds it: phase 4 introduces **no new anchors**. Every id
these two scenarios point at (`enforce-base-order-switch`, `arrange-route-btn`, `base-route-editor`,
`map-wrapper`, `visibility-hidden`, `save-base-btn`, `completion-content`, `readiness-indicator`)
is already in `KNOWN_ANCHORS`, and `unlock-trigger-` / `base-item-` are already in
`ANCHOR_PREFIXES`, from phases 1 and 2. Task 6 Step 4 only verifies that.

### Spec-copy deviations (documented here only; no index change)

6. **The `fixed-route` `route` step does NOT claim readiness checks the route.** The spec gist is
   "Readiness now checks that every base has a place in the route." That is false in both directions:
   `useReadinessChecks` (`web/src/features/build/ReadinessIndicator.tsx:76-100`) has no route check at
   all, and the server cannot fail one either — `BaseService.create` assigns
   `orderIndex = max(orderIndex) + 1` (`backend/.../service/BaseService.java:110-111`) and
   `BaseOrderService.sequenceNumbers` numbers every base 1..n, so the route is complete by
   construction. Corrected copy: every base already has a number, dragging only chooses who comes
   first.
7. **The `fixed-route` `readiness` step says the route needs no check**, for the same reason, and
   points at the checks that do exist (bases, challenges, teams, assignments, check-in methods).
8. **The `exploration` `hide` copy states what players actually see.**
   `PlayerService.getProgress` returns `null` for a hidden base with `status == not_visited`
   (`backend/.../service/PlayerService.java:253-266`), so a hidden base has no map pin and no list
   row until it is found. `buildCandidates` (`web/src/features/player/arrivalCandidates.ts:13-33`)
   deliberately keeps hidden geofence rows, so a hidden LOCATION base still fires on arrival. Both
   facts go in the copy.
9. **The `exploration` `clue` copy does not promise an "unlocks hidden base" control.**
   `Challenge.unlocksBaseIds` exists in the types and API (`web/src/types/index.ts:122`,
   `web/src/lib/api/challenges.ts:15`) and `challenges.unlocksBaseToggle` exists in the locales, but
   **no operator web screen renders it** (grep finds no consumer). In the browser today the only way
   a team reaches a hidden base is by physically checking in there, or by an operator rescue
   unlock-override. The copy therefore teaches the completion text as the clue, not as a mechanism.
   *Flag for the wave owner: the missing `unlocksBaseIds` control is a real product gap, out of scope here.*

## Global Constraints

- Every name — file paths, step ids, test ids, i18n key shapes, store and type names — matches the
  shared contract in `docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md` exactly.
  Phases 1–3 are assumed complete: `types.ts`, `engine.ts`, `store.ts`, `anchors.ts`,
  `scenarios/index.ts`, `scenarios/firstGame.ts`, `TourHost.tsx`, `TutorialsPage.tsx`,
  `SetupGamePicker.tsx`, the `tutorials.*` i18n block, and the groundwork test ids
  `arrange-route-btn`, `enforce-base-order-switch`, `mode-*` all exist.
- **Read `web/src/features/tutorials/scenarios/firstGame.ts` before writing any scenario code** and
  mirror its import style, ordering and formatting exactly. If it names a helper this plan also
  needs, reuse it instead of writing a second one.
- Never rename an existing `data-testid`, route, API path or query key. New ids only.
- Scenario files are data. No React, no hooks, no i18n calls, no `window` access, no domain
  mutations. `prepare` may only call `TourActions`.
- **Guard every `setMode`.** `setMode` in `web/src/stores/workspace.ts` closes the drawer and the
  settings panel as a side effect, and `prepare` re-runs on every resume from the pill, so an
  unconditional `a.setMode('build')` slams shut the panel the step is pointing into. Write
  `if (s.mode !== 'build') a.setMode('build')` — which is why these `prepare`s take `(a, s)`.
  `firstGame.ts` factors the same rule into a private `buildMode(a, s)` helper because it needs it
  six times; two occurrences per file here do not earn a shared export.
- Every new i18n key lands in `packages/i18n/src/locales/en.json`, `pt.json` **and** `de.json` in the
  same edit — `packages/i18n/src/locales.test.ts` fails on any key that exists in one language only,
  and on any empty string.
- Copy rules: bodies under ~45 words; every body names one thing *else* the operator can do on that
  screen; Portuguese and German are natural informal ("tu" / "du"), matching the tone of the existing
  `baseOrder`, `bases` and `readiness` blocks — not machine-literal English.
- No placeholders. Every code block in this plan is the complete final content of the region it
  describes. No `TODO`, no `...`, no "fill in later".
- ONE atomic commit at the very end, message `feat(web): fixed-route and exploration tutorials`,
  trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never commit
  `docs/specs/*` or `docs/superpowers/plans/*`.

## Verified facts this plan depends on

| Fact | Source |
|---|---|
| `unlockTriggers` values are `CHECK_IN`, `SUBMISSION`, `COMPLETED`; buttons carry `data-testid={`unlock-trigger-${ut.value}`}` | `web/src/features/build/GameSettingsPanel.tsx:36-54, 342` |
| `UnlockTrigger = 'CHECK_IN' \| 'SUBMISSION' \| 'COMPLETED'`; `Game.unlockTrigger` is typed `string` | `web/src/types/game.ts:11`, `web/src/types/index.ts` |
| Enforce switch is `<Switch id="enforce-base-order">`; phase 1 adds `data-testid="enforce-base-order-switch"` | `GameSettingsPanel.tsx:311` |
| Route editor visibility is **local** state: `arranging && !!game?.enforceBaseOrder` | `web/src/features/build/BasesTab.tsx:106, 122` |
| Arrange button is disabled unless `status === 'setup'` and `bases.length >= 2` | `BasesTab.tsx:133` |
| `data-testid="base-route-editor"` on the editor `<section>` | `web/src/features/build/BaseRouteEditor.tsx:37` |
| Base list rows carry `data-testid={`base-item-${base.id}`}` | `BasesTab.tsx:81` |
| `visibility-visible` / `visibility-hidden` exist, with **no** `aria-pressed` | `BaseDetail.tsx:405, 416` |
| `save-base-btn` exists; `hidden: localHidden` is sent on save | `BaseDetail.tsx:186, 546` |
| `completion-content` and `readiness-indicator` and `map-wrapper` exist | `ChallengeDetail.tsx:668`, `ReadinessIndicator.tsx:140`, `components/map/GameMap.tsx:110` |
| `Base` has `hidden: boolean` and `fixedChallengeId?: string`; `Assignment` has `baseId` / `challengeId` | `web/src/types/index.ts:53-108, 155-161` |
| `DrawerTab = 'bases' \| 'challenges' \| 'teams' \| 'stages' \| 'nfc'`; `GameMode` includes `'build'` | `web/src/stores/workspace.ts:3-4` |
| Readiness has 9 checks, none about base order | `ReadinessIndicator.tsx:76-100` |

## File Structure

| File | Responsibility |
|---|---|
| `web/src/features/tutorials/testState.ts` (modify, created in phase 1) | `makeTourState(overrides)` gains `fields` / `pressedGroups` |
| `web/src/features/tutorials/scenarios/fixedRoute.ts` (create) | the `fixed-route` `Scenario` |
| `web/src/features/tutorials/scenarios/fixedRoute.test.ts` (create) | definition + table-driven `advance()` tests |
| `web/src/features/tutorials/scenarios/exploration.ts` (create) | the `exploration` `Scenario` |
| `web/src/features/tutorials/scenarios/exploration.test.ts` (create) | definition + table-driven `advance()` tests |
| `web/src/features/tutorials/scenarios/index.ts` (modify) | register both scenarios |
| `web/src/features/tutorials/anchors.ts` (verify only) | phases 1-2 already catalogue every anchor these scenarios use |
| `web/src/features/build/BaseDetail.tsx` (modify, lines 403–425) | `aria-pressed` on the two visibility buttons |
| `web/src/features/build/BaseDetail.test.tsx` (modify) | assert the new `aria-pressed` |
| `packages/i18n/src/locales/{en,pt,de}.json` (modify) | `tutorials.scenarios.{fixedRoute,exploration}.*`, `tutorials.fixedRoute.*`, `tutorials.exploration.*` |
| `web/e2e/tutorials.spec.ts` (modify, created in phase 2) | one offline Playwright walk per scenario |
| `docs/visual-system/preview-matrix.md` (modify) | name both scenarios on the tutorials row |
| `docs/business-logic.md` (modify) | one line per scenario in the Onboarding subsection |

---

### Task 1: `aria-pressed` on the base visibility buttons

The `exploration.hide` step's completion rule is `s.field('visibility-hidden').pressed === true`.
`FieldReading.pressed` parses `aria-pressed` or `aria-checked` and is `null` when neither is present,
so without this the step can never complete. This is deviation 3.

**Files:**
- Modify: `web/src/features/build/BaseDetail.tsx` (lines 403–425, the Visibility section)
- Test: `web/src/features/build/BaseDetail.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `[data-testid="visibility-visible"]` and `[data-testid="visibility-hidden"]` expose
  `aria-pressed`, reflecting the draft `localHidden` state (not the saved row).

- [ ] **Step 1: Write the failing test**

Append to `web/src/features/build/BaseDetail.test.tsx`, inside the existing top-level `describe`.
The file already defines `function renderBaseDetail(baseId = 'base-1')` and its MSW handlers serve
a `createMockBase()` row with `hidden: false`, so call it with no argument:

```ts
  it('exposes the draft visibility as aria-pressed on both buttons', async () => {
    const user = userEvent.setup()
    renderBaseDetail()

    const visible = await screen.findByTestId('visibility-visible')
    const hidden = screen.getByTestId('visibility-hidden')
    expect(visible).toHaveAttribute('aria-pressed', 'true')
    expect(hidden).toHaveAttribute('aria-pressed', 'false')

    await user.click(hidden)

    // The draft flips immediately, before any save.
    expect(screen.getByTestId('visibility-hidden')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('visibility-visible')).toHaveAttribute('aria-pressed', 'false')
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run --cwd web test -- src/features/build/BaseDetail.test.tsx`
Expected: FAIL — `expect(element).toHaveAttribute("aria-pressed", "true")` with "received element
does not have attribute aria-pressed".

- [ ] **Step 3: Add the attributes**

In `web/src/features/build/BaseDetail.tsx`, the Visibility section becomes exactly:

```tsx
      {/* Visibility section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Visibility
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setLocalHidden(false)}
            data-testid="visibility-visible"
            type="button"
            aria-pressed={!localHidden}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              !localHidden
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-background text-muted-foreground border border-border hover:text-foreground'
            }`}
          >
            Visible
          </button>
          <button
            onClick={() => setLocalHidden(true)}
            data-testid="visibility-hidden"
            type="button"
            aria-pressed={localHidden}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              localHidden
                ? 'border border-warning/30 bg-warning/10 text-warning'
                : 'bg-background text-muted-foreground border border-border hover:text-foreground'
            }`}
          >
            Hidden
          </button>
        </div>
      </section>
```

(The `type="button"` additions stop either control submitting an enclosing form; they change no
existing behaviour because these buttons are already click handlers.)

- [ ] **Step 4: Run it and watch it pass**

Run: `bun run --cwd web test -- src/features/build/BaseDetail.test.tsx`
Expected: PASS, whole file green.

- [ ] **Step 5: Stage**

Stage: `git add web/src/features/build/BaseDetail.tsx web/src/features/build/BaseDetail.test.tsx`

---

### Task 2: Teach the shared `TourState` factory to fake DOM readings

**Files:**
- Modify: `web/src/features/tutorials/testState.ts`

**Interfaces:**
- Consumes: `TourState`, `FieldReading` from `web/src/features/tutorials/types.ts`.
- Produces: `TourStateOverrides` and a widened
  `makeTourState(overrides?: TourStateOverrides): TourState`.

Phase 1 created `web/src/features/tutorials/testState.ts` with `makeTourState(overrides?:
Partial<TourState>)`, and phase 2 added `gamesAtStart: []` to it. It is the **one** factory for the
wave — do not create `test/tourState.ts` or any second factory. The scenario predicates here read
`s.field(...)`, which phase 1's version cannot fake, so widen that file.

- [ ] **Step 1: Widen the factory**

`web/src/features/tutorials/testState.ts` becomes:

```ts
import type { FieldReading, TourState } from './types'

const NO_FIELD: FieldReading = { present: false, value: '', pressed: null }

export type TourStateOverrides = Partial<TourState> & {
  /** Synthetic DOM readings keyed by data-testid. Missing ids read as absent. */
  fields?: Record<string, Partial<FieldReading>>
  /** Synthetic aria-pressed winners keyed by group data-testid. */
  pressedGroups?: Record<string, string | null>
}

/**
 * A fully populated TourState with everything empty. Test-only, but it lives in
 * src (not src/test) because it is imported by tests in three folders.
 *
 * `fields` / `pressedGroups` fake the DOM readers; an explicit `field` or
 * `pressedIn` override still wins, which is what the phase-1 engine tests use.
 */
export function makeTourState(overrides: TourStateOverrides = {}): TourState {
  const { fields = {}, pressedGroups = {}, ...rest } = overrides
  return {
    now: 1_000,
    startedAt: 0,
    scenarioId: 'first-game',
    gameId: null,
    routeGameId: null,
    isDashboard: false,
    isNative: false,
    gamesAtStart: [],
    games: [],
    game: null,
    bases: [],
    challenges: [],
    teams: [],
    assignments: [],
    readiness: { allPassed: false, failing: [] },
    mode: 'build',
    drawerOpen: false,
    drawerTab: 'bases',
    selectedBaseId: null,
    selectedChallengeId: null,
    selectedTeamId: null,
    readinessExpanded: false,
    settingsPanelOpen: false,
    lastSuccess: {},
    stepCompletedAt: {},
    ackedSteps: new Set<string>(),
    laterSteps: new Set<string>(),
    field: (testId: string) => ({ ...NO_FIELD, ...(fields[testId] ?? {}) }),
    pressedIn: (groupTestId: string) => pressedGroups[groupTestId] ?? null,
    ...rest,
  }
}
```

Every existing call site keeps working: `...rest` stays last, so `makeTourState({ pressedIn: () =>
'base-checkin-method-location' })` in phase 1's `engine.test.ts` still overrides the synthetic
reader.

- [ ] **Step 2: Typecheck and re-run the phase-1 tests that use it**

Run: `bun run --cwd web typecheck`
Run: `bun run --cwd web test -- src/features/tutorials/engine.test.ts`
Expected: both PASS. If typecheck fails on a `TourState` field this factory omits or names
differently, fix the factory to match `web/src/features/tutorials/types.ts` — the types file is the
contract, not this plan.

- [ ] **Step 3: Stage**

Stage: `git add web/src/features/tutorials/testState.ts`

---

### Task 3: The `fixed-route` scenario

**Files:**
- Create: `web/src/features/tutorials/scenarios/fixedRoute.ts`
- Test: `web/src/features/tutorials/scenarios/fixedRoute.test.ts`

**Interfaces:**
- Consumes: `Scenario`, `TourState`, `TourActions` from `../types`; `advance`, `effectiveSteps`,
  `resolveAnchor`, `resolveBody` from `../engine`; `makeTourState` from `../testState`.
- Produces: `export const fixedRoute: Scenario` with `id: 'fixed-route'`, `entry: 'setup-game'` and
  step ids `enable-order`, `unlock-trigger`, `arrange`, `route`, `readiness` in that order.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/scenarios/fixedRoute.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { resources, keyPaths } from '@pointfinder/i18n'
import { isKnownAnchor } from '../anchors'
import { advance, effectiveSteps, resolveAnchor, resolveBody } from '../engine'
import { makeTourState, type TourStateOverrides } from '../testState'
import type { Game } from '@/types'
import { fixedRoute } from './fixedRoute'

const NO_CLICKS: ReadonlySet<string> = new Set<string>()

function game(overrides: Partial<Game>): Game {
  return {
    id: 'g1',
    name: 'Forest game',
    description: '',
    startDate: null,
    endDate: null,
    status: 'setup',
    createdBy: 'u1',
    operatorIds: ['u1'],
    uniformAssignment: false,
    broadcastEnabled: false,
    broadcastCode: null,
    tileSource: 'osm',
    unlockTrigger: 'CHECK_IN',
    enforceBaseOrder: false,
    defaultCheckInMethod: 'NFC',
    defaultCheckInRadiusM: 15,
    ...overrides,
  }
}

describe('fixed-route scenario definition', () => {
  it('is a setup-game scenario with the contract step ids in order', () => {
    expect(fixedRoute.id).toBe('fixed-route')
    expect(fixedRoute.entry).toBe('setup-game')
    expect(fixedRoute.steps.map((s) => s.id)).toEqual([
      'enable-order',
      'unlock-trigger',
      'arrange',
      'route',
      'readiness',
    ])
  })

  it('has unique step ids', () => {
    const ids = fixedRoute.steps.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('anchors only test ids the app is known to render', () => {
    const state = makeTourState({ game: game({ unlockTrigger: 'SUBMISSION' }) })
    for (const step of fixedRoute.steps) {
      expect(isKnownAnchor(resolveAnchor(step, state)), `${step.id} anchor`).toBe(true)
    }
  })

  it('falls back to CHECK_IN when the game has no unlock trigger yet', () => {
    const step = fixedRoute.steps.find((s) => s.id === 'unlock-trigger')!
    expect(resolveAnchor(step, makeTourState({ game: null }))).toBe('unlock-trigger-CHECK_IN')
    expect(resolveAnchor(step, makeTourState({ game: game({ unlockTrigger: 'COMPLETED' }) }))).toBe(
      'unlock-trigger-COMPLETED',
    )
  })

  it.each(['en', 'pt', 'de'] as const)('has every copy key in %s', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    expect(paths.has('tutorials.scenarios.fixedRoute.title')).toBe(true)
    expect(paths.has('tutorials.scenarios.fixedRoute.blurb')).toBe(true)
    expect(paths.has(fixedRoute.title)).toBe(true)
    expect(paths.has(fixedRoute.blurb)).toBe(true)
    for (const step of fixedRoute.steps) {
      expect(paths.has(step.copy.title), `${step.id} title`).toBe(true)
      expect(paths.has(step.copy.body), `${step.id} body`).toBe(true)
      for (const branch of step.branchCopy ?? []) {
        expect(paths.has(branch.body), `${step.id} branch`).toBe(true)
      }
    }
  })

  it('keys every step under tutorials.fixedRoute.<stepId>', () => {
    for (const step of fixedRoute.steps) {
      expect(step.copy.title).toBe(`tutorials.fixedRoute.${step.id}.title`)
      expect(step.copy.body).toBe(`tutorials.fixedRoute.${step.id}.body`)
    }
  })

  it('warns instead of stalling when the game has fewer than two bases', () => {
    const step = fixedRoute.steps.find((s) => s.id === 'arrange')!
    const oneBase = makeTourState({ bases: [{ id: 'b1' }] as never })
    const twoBases = makeTourState({ bases: [{ id: 'b1' }, { id: 'b2' }] as never })
    expect(resolveBody(step, oneBase)).toBe('tutorials.fixedRoute.arrange.branch.needsTwoBases')
    expect(resolveBody(step, twoBases)).toBe('tutorials.fixedRoute.arrange.body')
  })

  it('keeps every step in the effective list — no when guards', () => {
    expect(effectiveSteps(fixedRoute, makeTourState()).map((s) => s.id)).toEqual(
      fixedRoute.steps.map((s) => s.id),
    )
  })

  it('never switches mode when the operator is already in build', () => {
    const setMode = vi.fn()
    const actions = {
      setMode,
      openDrawer: () => {},
      selectBase: () => {},
      selectChallenge: () => {},
      selectTeam: () => {},
      setReadinessExpanded: () => {},
      setSettingsPanelOpen: () => {},
      navigate: () => {},
    } as never

    // `setMode` closes the drawer and the settings panel, and `prepare` re-runs on
    // every resume — a step already in build mode must not call it.
    for (const step of fixedRoute.steps) {
      step.prepare?.(actions, makeTourState({ mode: 'build' }))
    }
    expect(setMode).not.toHaveBeenCalled()

    fixedRoute.steps[0].prepare?.(actions, makeTourState({ mode: 'command' }))
    expect(setMode).toHaveBeenCalledWith('build')
  })
})

describe('fixed-route advance()', () => {
  // `advance` is id-in / id-out: `from` is the step the run was on, `null` means a
  // fresh run, and `null` back means the scenario is finished.
  const cases: Array<{
    name: string
    state: TourStateOverrides
    from: string | null
    expectId: string | null
  }> = [
    {
      name: 'order off → enable-order',
      state: { game: game({ enforceBaseOrder: false }) },
      from: null,
      expectId: 'enable-order',
    },
    {
      name: 'order on → unlock-trigger',
      state: { game: game({ enforceBaseOrder: true }) },
      from: null,
      expectId: 'unlock-trigger',
    },
    {
      name: 'unlock-trigger acked → arrange',
      state: { game: game({ enforceBaseOrder: true }), ackedSteps: new Set(['unlock-trigger']) },
      from: null,
      expectId: 'arrange',
    },
    {
      name: 'route editor present → route',
      state: {
        game: game({ enforceBaseOrder: true }),
        ackedSteps: new Set(['unlock-trigger']),
        fields: { 'base-route-editor': { present: true } },
      },
      from: null,
      expectId: 'route',
    },
    {
      name: 'route acked → readiness',
      state: {
        game: game({ enforceBaseOrder: true }),
        ackedSteps: new Set(['unlock-trigger', 'route']),
        fields: { 'base-route-editor': { present: true } },
      },
      from: null,
      expectId: 'readiness',
    },
    {
      name: 'everything acked → finished',
      state: {
        game: game({ enforceBaseOrder: true }),
        ackedSteps: new Set(['unlock-trigger', 'route', 'readiness']),
        fields: { 'base-route-editor': { present: true } },
      },
      from: null,
      expectId: null,
    },
    {
      name: 'ack steps are never auto-skipped, even when later predicates pass',
      state: {
        game: game({ enforceBaseOrder: true }),
        fields: { 'base-route-editor': { present: true } },
      },
      from: 'unlock-trigger',
      expectId: 'unlock-trigger',
    },
  ]

  it.each(cases)('$name', ({ state, from, expectId }) => {
    expect(advance(fixedRoute, makeTourState(state), NO_CLICKS, from)).toBe(expectId)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run --cwd web test -- src/features/tutorials/scenarios/fixedRoute.test.ts`
Expected: FAIL — "Failed to resolve import ./fixedRoute".

- [ ] **Step 3: Write the scenario**

Create `web/src/features/tutorials/scenarios/fixedRoute.ts`:

```ts
import type { Scenario } from '../types'

/**
 * Turn one setup game into a fixed route: enforce the order, choose what unlocks the
 * next base, and arrange the shared running order. Nothing here creates or deletes an
 * entity — every prepare only moves operator UI state.
 */
export const fixedRoute: Scenario = {
  id: 'fixed-route',
  entry: 'setup-game',
  title: 'tutorials.scenarios.fixedRoute.title',
  blurb: 'tutorials.scenarios.fixedRoute.blurb',
  steps: [
    {
      id: 'enable-order',
      route: 'workspace',
      anchor: 'enforce-base-order-switch',
      // `setMode` closes the drawer and the settings panel as a side effect, and
      // `prepare` re-runs on every resume — so only switch when we are not there.
      prepare: (a, s) => {
        if (s.mode !== 'build') a.setMode('build')
        a.setSettingsPanelOpen(true)
      },
      done: { kind: 'predicate', test: (s) => s.game?.enforceBaseOrder === true },
      copy: {
        title: 'tutorials.fixedRoute.enable-order.title',
        body: 'tutorials.fixedRoute.enable-order.body',
      },
    },
    {
      id: 'unlock-trigger',
      route: 'workspace',
      // The three buttons render as unlock-trigger-CHECK_IN | SUBMISSION | COMPLETED.
      anchor: (s) => `unlock-trigger-${s.game?.unlockTrigger ?? 'CHECK_IN'}`,
      prepare: (a, s) => {
        if (s.mode !== 'build') a.setMode('build')
        a.setSettingsPanelOpen(true)
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.fixedRoute.unlock-trigger.title',
        body: 'tutorials.fixedRoute.unlock-trigger.body',
      },
    },
    {
      id: 'arrange',
      route: 'workspace',
      anchor: 'arrange-route-btn',
      prepare: (a) => {
        a.setSettingsPanelOpen(false)
        a.openDrawer('bases')
      },
      // BasesTab keeps the editor in local state, so the DOM is the only observable.
      done: { kind: 'predicate', test: (s) => s.field('base-route-editor').present },
      copy: {
        title: 'tutorials.fixedRoute.arrange.title',
        body: 'tutorials.fixedRoute.arrange.body',
      },
      branchCopy: [
        {
          when: (s) => s.bases.length < 2,
          body: 'tutorials.fixedRoute.arrange.branch.needsTwoBases',
        },
      ],
    },
    {
      id: 'route',
      route: 'workspace',
      anchor: 'base-route-editor',
      prepare: (a) => {
        a.setSettingsPanelOpen(false)
        a.openDrawer('bases')
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.fixedRoute.route.title',
        body: 'tutorials.fixedRoute.route.body',
      },
    },
    {
      id: 'readiness',
      route: 'workspace',
      anchor: 'readiness-indicator',
      prepare: (a) => {
        a.setSettingsPanelOpen(false)
        a.setReadinessExpanded(true)
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.fixedRoute.readiness.title',
        body: 'tutorials.fixedRoute.readiness.body',
      },
    },
  ],
}
```

Note: there is no "marks completed" flag on a step. `readiness` is last, so acking it makes
`advance()` return `null`, which is what phase 1's `TourRunner` turns into a `complete()` call
and phase 3's write-through then sends as a `completed` progress row. Do not add a field the
contract does not have.

- [ ] **Step 4: Run it — anchors and advance should pass, copy keys should still fail**

Run: `bun run --cwd web test -- src/features/tutorials/scenarios/fixedRoute.test.ts`
Expected: the `advance()` block and the definition assertions PASS; the three `has every copy key in
<lang>` cases FAIL because Task 5 has not added the strings yet. That is the expected intermediate
state — Task 5 closes it.

- [ ] **Step 5: Stage**

Stage: `git add web/src/features/tutorials/scenarios/fixedRoute.ts web/src/features/tutorials/scenarios/fixedRoute.test.ts`

---

### Task 4: The `exploration` scenario

**Files:**
- Create: `web/src/features/tutorials/scenarios/exploration.ts`
- Test: `web/src/features/tutorials/scenarios/exploration.test.ts`

**Interfaces:**
- Consumes: same as Task 3.
- Produces: `export const exploration: Scenario` with `id: 'exploration'`, `entry: 'setup-game'` and
  step ids `place-first`, `pick-base`, `hide`, `hide-save`, `clue`, `readiness`.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/scenarios/exploration.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { resources, keyPaths } from '@pointfinder/i18n'
import { isKnownAnchor } from '../anchors'
import { advance, effectiveSteps, resolveAnchor } from '../engine'
import { makeTourState, type TourStateOverrides } from '../testState'
import type { Base, Challenge } from '@/types'
import { exploration } from './exploration'

const NO_CLICKS: ReadonlySet<string> = new Set<string>()

function base(overrides: Partial<Base> & { id: string }): Base {
  return {
    gameId: 'g1',
    name: 'Old mill',
    description: '',
    lat: 38.7,
    lng: -9.1,
    nfcLinked: true,
    hidden: false,
    checkInMethod: 'NFC',
    ...overrides,
  } as Base
}

function challenge(id: string): Challenge {
  return {
    id,
    gameId: 'g1',
    title: `Challenge ${id}`,
    description: '',
    content: '<p>Find it.</p>',
    completionContent: '',
    answerType: 'text',
    autoValidate: false,
    points: 10,
    locationBound: false,
    requirePresenceToSubmit: false,
  } as Challenge
}

const TWO_BASES = [base({ id: 'b1' }), base({ id: 'b2' })]

describe('exploration scenario definition', () => {
  it('is a setup-game scenario with its step ids in order', () => {
    expect(exploration.id).toBe('exploration')
    expect(exploration.entry).toBe('setup-game')
    expect(exploration.steps.map((s) => s.id)).toEqual([
      'place-first',
      'pick-base',
      'hide',
      'hide-save',
      'clue',
      'readiness',
    ])
  })

  it('has unique step ids', () => {
    const ids = exploration.steps.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('shows exactly one of place-first and pick-base', () => {
    expect(effectiveSteps(exploration, makeTourState({ bases: [] })).map((s) => s.id)).toContain(
      'place-first',
    )
    expect(effectiveSteps(exploration, makeTourState({ bases: [] })).map((s) => s.id)).not.toContain(
      'pick-base',
    )
    const withBases = effectiveSteps(exploration, makeTourState({ bases: TWO_BASES })).map((s) => s.id)
    expect(withBases).toContain('pick-base')
    expect(withBases).not.toContain('place-first')
  })

  it('drops the clue step when the game has no challenges', () => {
    const ids = effectiveSteps(exploration, makeTourState({ bases: TWO_BASES })).map((s) => s.id)
    expect(ids).not.toContain('clue')
    const withChallenge = effectiveSteps(
      exploration,
      makeTourState({ bases: TWO_BASES, challenges: [challenge('c1')] }),
    ).map((s) => s.id)
    expect(withChallenge).toContain('clue')
  })

  it('anchors only test ids the app is known to render', () => {
    const state = makeTourState({ bases: TWO_BASES, challenges: [challenge('c1')] })
    for (const step of exploration.steps) {
      expect(isKnownAnchor(resolveAnchor(step, state)), `${step.id} anchor`).toBe(true)
    }
  })

  it('anchors pick-base at the first base', () => {
    const step = exploration.steps.find((s) => s.id === 'pick-base')!
    expect(resolveAnchor(step, makeTourState({ bases: TWO_BASES }))).toBe('base-item-b1')
  })

  it.each(['en', 'pt', 'de'] as const)('has every copy key in %s', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    expect(paths.has('tutorials.scenarios.exploration.title')).toBe(true)
    expect(paths.has('tutorials.scenarios.exploration.blurb')).toBe(true)
    expect(paths.has(exploration.title)).toBe(true)
    expect(paths.has(exploration.blurb)).toBe(true)
    for (const step of exploration.steps) {
      expect(paths.has(step.copy.title), `${step.id} title`).toBe(true)
      expect(paths.has(step.copy.body), `${step.id} body`).toBe(true)
    }
  })

  it('keys every step under tutorials.exploration.<stepId>', () => {
    for (const step of exploration.steps) {
      expect(step.copy.title).toBe(`tutorials.exploration.${step.id}.title`)
      expect(step.copy.body).toBe(`tutorials.exploration.${step.id}.body`)
    }
  })

  it('never switches mode when the operator is already in build', () => {
    const setMode = vi.fn()
    const actions = {
      setMode,
      openDrawer: () => {},
      selectBase: () => {},
      selectChallenge: () => {},
      selectTeam: () => {},
      setReadinessExpanded: () => {},
      setSettingsPanelOpen: () => {},
      navigate: () => {},
    } as never

    // `setMode` closes the drawer, and `pick-base` opens it on the next line —
    // an unguarded call would shut the panel its own anchor lives in.
    for (const step of exploration.steps) {
      step.prepare?.(actions, makeTourState({ mode: 'build', bases: TWO_BASES }))
    }
    expect(setMode).not.toHaveBeenCalled()

    const pickBase = exploration.steps.find((s) => s.id === 'pick-base')!
    pickBase.prepare?.(actions, makeTourState({ mode: 'review', bases: TWO_BASES }))
    expect(setMode).toHaveBeenCalledWith('build')
  })
})

describe('exploration clue target', () => {
  const calls: Array<[string, string | null]> = []
  const actions = {
    setMode: () => {},
    openDrawer: (tab: string) => calls.push(['openDrawer', tab]),
    selectBase: () => {},
    selectChallenge: (id: string | null) => calls.push(['selectChallenge', id]),
    selectTeam: () => {},
    setReadinessExpanded: () => {},
    setSettingsPanelOpen: () => {},
    navigate: () => {},
  } as never

  function prepareClue(state: TourStateOverrides): Array<[string, string | null]> {
    calls.length = 0
    const step = exploration.steps.find((s) => s.id === 'clue')!
    step.prepare?.(actions, makeTourState(state))
    return [...calls]
  }

  it('prefers the challenge pinned to the selected base', () => {
    expect(
      prepareClue({
        selectedBaseId: 'b1',
        bases: [base({ id: 'b1', hidden: true, fixedChallengeId: 'c9' }), base({ id: 'b2' })],
        challenges: [challenge('c1'), challenge('c9')],
      }),
    ).toEqual([
      ['openDrawer', 'challenges'],
      ['selectChallenge', 'c9'],
    ])
  })

  it('falls back to an assignment on the selected base', () => {
    expect(
      prepareClue({
        selectedBaseId: 'b1',
        bases: TWO_BASES,
        challenges: [challenge('c1'), challenge('c5')],
        assignments: [{ id: 'a1', gameId: 'g1', baseId: 'b1', challengeId: 'c5' }],
      }),
    ).toEqual([
      ['openDrawer', 'challenges'],
      ['selectChallenge', 'c5'],
    ])
  })

  it('falls back to the first challenge', () => {
    expect(
      prepareClue({ selectedBaseId: 'b1', bases: TWO_BASES, challenges: [challenge('c1')] }),
    ).toEqual([
      ['openDrawer', 'challenges'],
      ['selectChallenge', 'c1'],
    ])
  })

  it('opens the tab but selects nothing when there is no challenge', () => {
    expect(prepareClue({ selectedBaseId: 'b1', bases: TWO_BASES })).toEqual([
      ['openDrawer', 'challenges'],
    ])
  })
})

describe('exploration advance()', () => {
  const hiddenSaved = [base({ id: 'b1', hidden: true }), base({ id: 'b2' })]
  // Every case starts a fresh run (`fromStepId` null) and asserts the step id
  // `advance` returns; `null` means the scenario is finished.
  const cases: Array<{ name: string; state: TourStateOverrides; expectId: string | null }> = [
    { name: 'no bases → place-first', state: { bases: [] }, expectId: 'place-first' },
    { name: 'bases but none selected → pick-base', state: { bases: TWO_BASES }, expectId: 'pick-base' },
    {
      name: 'base selected → hide',
      state: { bases: TWO_BASES, selectedBaseId: 'b1' },
      expectId: 'hide',
    },
    {
      name: 'hidden pressed but unsaved → hide-save',
      state: {
        bases: TWO_BASES,
        selectedBaseId: 'b1',
        fields: { 'visibility-hidden': { present: true, pressed: true } },
      },
      expectId: 'hide-save',
    },
    {
      name: 'saved hidden with a challenge → clue',
      state: {
        bases: hiddenSaved,
        selectedBaseId: 'b1',
        challenges: [challenge('c1')],
        fields: { 'visibility-hidden': { present: true, pressed: true } },
      },
      expectId: 'clue',
    },
    {
      name: 'saved hidden with no challenges → readiness',
      state: {
        bases: hiddenSaved,
        selectedBaseId: 'b1',
        fields: { 'visibility-hidden': { present: true, pressed: true } },
      },
      expectId: 'readiness',
    },
    {
      name: 'clue acked → readiness',
      state: {
        bases: hiddenSaved,
        selectedBaseId: 'b1',
        challenges: [challenge('c1')],
        ackedSteps: new Set(['clue']),
        fields: { 'visibility-hidden': { present: true, pressed: true } },
      },
      expectId: 'readiness',
    },
    {
      name: 'readiness acked → finished',
      state: {
        bases: hiddenSaved,
        selectedBaseId: 'b1',
        challenges: [challenge('c1')],
        ackedSteps: new Set(['clue', 'readiness']),
        fields: { 'visibility-hidden': { present: true, pressed: true } },
      },
      expectId: null,
    },
  ]

  it.each(cases)('$name', ({ state, expectId }) => {
    expect(advance(exploration, makeTourState(state), NO_CLICKS, null)).toBe(expectId)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run --cwd web test -- src/features/tutorials/scenarios/exploration.test.ts`
Expected: FAIL — "Failed to resolve import ./exploration".

- [ ] **Step 3: Write the scenario**

Create `web/src/features/tutorials/scenarios/exploration.ts`:

```ts
import type { Scenario, TourState } from '../types'

/**
 * Hide one base and teach the clue that leads a team to it. Hidden bases have no pin and
 * no list row for players until they check in there (PlayerService.getProgress drops them),
 * so the clue text on another challenge is the whole game mechanic.
 */
function clueChallengeId(s: TourState): string | null {
  const selected = s.bases.find((b) => b.id === s.selectedBaseId)
  if (selected?.fixedChallengeId) return selected.fixedChallengeId
  const assigned = selected
    ? s.assignments.find((a) => a.baseId === selected.id)?.challengeId
    : undefined
  return assigned ?? s.challenges[0]?.id ?? null
}

export const exploration: Scenario = {
  id: 'exploration',
  entry: 'setup-game',
  title: 'tutorials.scenarios.exploration.title',
  blurb: 'tutorials.scenarios.exploration.blurb',
  steps: [
    {
      id: 'place-first',
      route: 'workspace',
      anchor: 'map-wrapper',
      when: (s) => s.bases.length === 0,
      // Guarded: `setMode` closes the drawer and the settings panel, and `prepare`
      // re-runs every time the operator resumes from the pill.
      prepare: (a, s) => {
        if (s.mode !== 'build') a.setMode('build')
      },
      done: { kind: 'predicate', test: (s) => s.bases.length > 0 },
      copy: {
        title: 'tutorials.exploration.place-first.title',
        body: 'tutorials.exploration.place-first.body',
      },
    },
    {
      id: 'pick-base',
      route: 'workspace',
      anchor: (s) => `base-item-${s.bases[0]?.id ?? ''}`,
      when: (s) => s.bases.length > 0,
      prepare: (a, s) => {
        // Order matters as much as the guard: an unguarded `setMode` here would
        // close the very drawer the next line opens.
        if (s.mode !== 'build') a.setMode('build')
        a.openDrawer('bases')
      },
      done: { kind: 'predicate', test: (s) => s.selectedBaseId !== null },
      copy: {
        title: 'tutorials.exploration.pick-base.title',
        body: 'tutorials.exploration.pick-base.body',
      },
    },
    {
      id: 'hide',
      route: 'workspace',
      anchor: 'visibility-hidden',
      prepare: (a) => {
        a.openDrawer('bases')
      },
      // Visibility is a draft in BaseDetail's local state; aria-pressed is the only reading.
      done: { kind: 'predicate', test: (s) => s.field('visibility-hidden').pressed === true },
      copy: {
        title: 'tutorials.exploration.hide.title',
        body: 'tutorials.exploration.hide.body',
      },
    },
    {
      id: 'hide-save',
      route: 'workspace',
      anchor: 'save-base-btn',
      prepare: (a) => {
        a.openDrawer('bases')
      },
      done: {
        kind: 'predicate',
        test: (s) => s.bases.find((b) => b.id === s.selectedBaseId)?.hidden === true,
      },
      copy: {
        title: 'tutorials.exploration.hide-save.title',
        body: 'tutorials.exploration.hide-save.body',
      },
    },
    {
      id: 'clue',
      route: 'workspace',
      anchor: 'completion-content',
      when: (s) => s.challenges.length > 0,
      prepare: (a, s) => {
        a.openDrawer('challenges')
        const id = clueChallengeId(s)
        if (id) a.selectChallenge(id)
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.exploration.clue.title',
        body: 'tutorials.exploration.clue.body',
      },
    },
    {
      id: 'readiness',
      route: 'workspace',
      anchor: 'readiness-indicator',
      prepare: (a) => {
        a.setReadinessExpanded(true)
      },
      done: { kind: 'ack' },
      copy: {
        title: 'tutorials.exploration.readiness.title',
        body: 'tutorials.exploration.readiness.body',
      },
    },
  ],
}
```

- [ ] **Step 4: Run it — everything but the copy-key cases should pass**

Run: `bun run --cwd web test -- src/features/tutorials/scenarios/exploration.test.ts`
Expected: definition, clue-target and `advance()` blocks PASS; the three `has every copy key in
<lang>` cases FAIL until Task 5.

- [ ] **Step 5: Stage**

Stage: `git add web/src/features/tutorials/scenarios/exploration.ts web/src/features/tutorials/scenarios/exploration.test.ts`

---

### Task 5: Copy in English, Portuguese and German

**Files:**
- Modify: `packages/i18n/src/locales/en.json`
- Modify: `packages/i18n/src/locales/pt.json`
- Modify: `packages/i18n/src/locales/de.json`

**Interfaces:**
- Consumes: the key names asserted in Tasks 3 and 4.
- Produces: `tutorials.fixedRoute.<stepId>.{title,body}` (plus `arrange.branch.needsTwoBases`) and
  `tutorials.exploration.<stepId>.{title,body}`.
- Produces **nothing** under `tutorials.scenarios.*`.

Phase 2 already wrote `tutorials.scenarios.fixedRoute.{title,blurb}` and
`tutorials.scenarios.exploration.{title,blurb}` in all three locales, and already added
`tutorials.scenarios.fixedRoute.title` / `tutorials.scenarios.exploration.title` to `contractKeys`
in `packages/i18n/src/locales.test.ts`. **Do not touch either — no new `contractKeys` entries and no
second `scenarios` block.** Tasks 3 and 4 assert those keys exist; they already do.

Merge only the two step blocks below into the **existing** top-level `tutorials` object, as
siblings of `firstGame`. Do not create a second `tutorials` key.

- [ ] **Step 1: Run the i18n test first, to see the current baseline**

Run: `bun run --cwd packages/i18n test`
Expected: PASS (phase 1–3 keys are already in sync). If it fails here, fix that before adding keys.

- [ ] **Step 2: Add the English copy**

In `packages/i18n/src/locales/en.json`, inside the existing `tutorials` object and directly after
the `"firstGame"` block, add:

```json
    "fixedRoute": {
      "enable-order": {
        "title": "Turn on the route",
        "body": "Switch on Enforce base order. Teams then check in at bases in one shared order: base 2 is refused until base 1 is done. This panel also holds the game name, map style, operators and export."
      },
      "unlock-trigger": {
        "title": "What unlocks the next base",
        "body": "Check-in can be enough, or you can require a submission or an approved answer. The setting covers the whole game, not just the route. For a first route, check-in keeps teams moving."
      },
      "arrange": {
        "title": "Open the route editor",
        "body": "Arrange route opens the running order. It needs at least two bases and only works while the game is in setup. Beside it are the search, the base list and every base you can edit.",
        "branch": {
          "needsTwoBases": "Arrange route stays disabled until this game has two bases. Add one more on the map and come back — the button enables itself."
        }
      },
      "route": {
        "title": "Set the order",
        "body": "Drag a base or use the arrows, then save. Every base already has a number, so the route is never incomplete — you only choose who comes first. One route serves all teams; challenges can still differ."
      },
      "readiness": {
        "title": "Before you go live",
        "body": "The route itself has no check here: every base is numbered automatically. This pill still guards bases, challenges, teams, assignments and check-in methods. Expand it any time to see what is missing."
      }
    },
    "exploration": {
      "place-first": {
        "title": "Place a base first",
        "body": "This game has no bases yet. Tap the map where players should end up and choose Place base here. The map is also where you drag markers and open a base for editing."
      },
      "pick-base": {
        "title": "Pick a base to hide",
        "body": "Open a base from this list. Everything about it lives in the panel that opens: name, coordinates, check-in method, tags and visibility. Search filters the list once a game grows."
      },
      "hide": {
        "title": "Hide it from the map",
        "body": "Choose Hidden. Players get no pin and no list row for this base until they check in there. A hidden GPS base still fires when a team walks into its radius."
      },
      "hide-save": {
        "title": "Save the base",
        "body": "Visibility is a draft until you save. Saving writes it and the list shows a Hidden tag. Nothing else on this form changes — you can keep editing the base afterwards."
      },
      "clue": {
        "title": "Write the clue",
        "body": "Unlocked Information is what a team reads after finishing a challenge. Put the clue to the hidden base here: a landmark, a riddle, a bearing. There is no pin to follow, so this text is the only guide."
      },
      "readiness": {
        "title": "Hidden bases still count",
        "body": "Readiness treats a hidden base like any other: it needs a working check-in method, and an NFC one needs a linked tag. Expand the pill for the full checklist before going live."
      }
    }
```

- [ ] **Step 3: Add the Portuguese copy**

Same position in `packages/i18n/src/locales/pt.json`. Informal "tu", matching `baseOrder` and
`bases` in the same file:

```json
    "fixedRoute": {
      "enable-order": {
        "title": "Liga o percurso",
        "body": "Liga «Impor ordem das bases». As equipas passam a fazer check-in numa ordem partilhada: a base 2 é recusada enquanto a 1 estiver por fazer. Este painel guarda também o nome do jogo, o estilo do mapa, os operadores e a exportação."
      },
      "unlock-trigger": {
        "title": "O que desbloqueia a base seguinte",
        "body": "O check-in pode bastar, ou podes exigir uma resposta enviada ou já aprovada. A definição vale para o jogo todo, não só para o percurso. Num primeiro percurso, o check-in mantém as equipas em movimento."
      },
      "arrange": {
        "title": "Abre o editor de percurso",
        "body": "«Ordenar percurso» abre a ordem de visita. Precisa de pelo menos duas bases e só funciona com o jogo em preparação. Ao lado ficam a pesquisa, a lista e a edição de cada base.",
        "branch": {
          "needsTwoBases": "«Ordenar percurso» fica desativado até o jogo ter duas bases. Cria mais uma no mapa e volta aqui — o botão ativa-se sozinho."
        }
      },
      "route": {
        "title": "Define a ordem",
        "body": "Arrasta uma base ou usa as setas e guarda. Todas as bases já têm número, por isso o percurso nunca fica incompleto — só escolhes quem vem primeiro. O percurso é o mesmo para todas as equipas; os desafios podem variar."
      },
      "readiness": {
        "title": "Antes de ires para o ar",
        "body": "O percurso não tem verificação aqui: cada base é numerada automaticamente. Esta bolha continua a vigiar bases, desafios, equipas, atribuições e métodos de check-in. Abre-a quando quiseres para ver o que falta."
      }
    },
    "exploration": {
      "place-first": {
        "title": "Cria primeiro uma base",
        "body": "Este jogo ainda não tem bases. Toca no mapa onde os jogadores devem chegar e escolhe «Criar base aqui». É também no mapa que arrastas marcadores e abres uma base para editar."
      },
      "pick-base": {
        "title": "Escolhe a base a esconder",
        "body": "Abre uma base desta lista. Tudo sobre ela fica no painel que se abre: nome, coordenadas, método de check-in, etiquetas e visibilidade. A pesquisa filtra a lista quando o jogo cresce."
      },
      "hide": {
        "title": "Esconde-a do mapa",
        "body": "Escolhe «Oculta». Os jogadores não veem pino nem linha na lista até fazerem check-in aqui. Uma base GPS oculta continua a disparar quando uma equipa entra no seu raio."
      },
      "hide-save": {
        "title": "Guarda a base",
        "body": "A visibilidade é um rascunho até guardares. Ao guardar, a lista passa a mostrar a etiqueta «Oculta». Mais nada muda no formulário — podes continuar a editar a base depois."
      },
      "clue": {
        "title": "Escreve a pista",
        "body": "«Informação desbloqueada» é o que a equipa lê depois de concluir um desafio. Põe aqui a pista para a base oculta: um marco, um enigma, uma direção. Não há pino a seguir, este texto é o único guia."
      },
      "readiness": {
        "title": "As bases ocultas contam",
        "body": "A prontidão trata uma base oculta como qualquer outra: precisa de um método de check-in válido e, se for NFC, de uma etiqueta ligada. Abre a bolha para veres a lista antes de ires para o ar."
      }
    }
```

- [ ] **Step 4: Add the German copy**

Same position in `packages/i18n/src/locales/de.json`. Informal "du", and "Basis/Basen" to match
`readiness` in the same file:

```json
    "fixedRoute": {
      "enable-order": {
        "title": "Route einschalten",
        "body": "Schalte „Basisreihenfolge erzwingen“ ein. Teams checken dann in einer gemeinsamen Reihenfolge ein: Basis 2 wird abgelehnt, solange Basis 1 offen ist. In diesem Panel liegen außerdem Spielname, Kartenstil, Operatoren und Export."
      },
      "unlock-trigger": {
        "title": "Was die nächste Basis freischaltet",
        "body": "Der Check-in kann genügen, oder du verlangst eine Abgabe oder eine freigegebene Antwort. Das gilt für das ganze Spiel, nicht nur für die Route. Für eine erste Route hält der Check-in die Teams in Bewegung."
      },
      "arrange": {
        "title": "Routeneditor öffnen",
        "body": "„Route anordnen“ öffnet die Besuchsreihenfolge. Sie braucht mindestens zwei Basen und funktioniert nur während der Einrichtung. Daneben liegen die Suche, die Liste und jede einzelne Basis zum Bearbeiten.",
        "branch": {
          "needsTwoBases": "„Route anordnen“ bleibt deaktiviert, bis das Spiel zwei Basen hat. Lege auf der Karte noch eine an und komm zurück — der Button wird von selbst aktiv."
        }
      },
      "route": {
        "title": "Reihenfolge festlegen",
        "body": "Zieh eine Basis oder nutze die Pfeile, dann speichern. Jede Basis hat schon eine Nummer, die Route ist also nie unvollständig — du wählst nur, wer zuerst kommt. Eine Route für alle Teams, die Aufgaben dürfen sich unterscheiden."
      },
      "readiness": {
        "title": "Vor dem Livegang",
        "body": "Für die Route selbst gibt es hier keine Prüfung: jede Basis wird automatisch nummeriert. Die Pille wacht weiter über Basen, Aufgaben, Teams, Zuweisungen und Check-in-Methoden. Klapp sie jederzeit auf, um Offenes zu sehen."
      }
    },
    "exploration": {
      "place-first": {
        "title": "Zuerst eine Basis setzen",
        "body": "Dieses Spiel hat noch keine Basen. Tipp auf die Karte, wo die Spieler ankommen sollen, und wähle „Basis hier anlegen“. Auf der Karte ziehst du auch Marker und öffnest eine Basis zum Bearbeiten."
      },
      "pick-base": {
        "title": "Basis zum Ausblenden wählen",
        "body": "Öffne eine Basis aus dieser Liste. Alles dazu steht im Panel, das sich öffnet: Name, Koordinaten, Check-in-Methode, Tags und Sichtbarkeit. Die Suche filtert die Liste, sobald ein Spiel wächst."
      },
      "hide": {
        "title": "Von der Karte ausblenden",
        "body": "Wähle „Ausgeblendet“. Spieler sehen weder Pin noch Listeneintrag, bis sie hier einchecken. Eine ausgeblendete GPS-Basis löst trotzdem aus, sobald ein Team in ihren Radius läuft."
      },
      "hide-save": {
        "title": "Basis speichern",
        "body": "Die Sichtbarkeit ist ein Entwurf, bis du speicherst. Danach zeigt die Liste den Hinweis „Ausgeblendet“. Sonst ändert sich nichts — du kannst die Basis danach weiter bearbeiten."
      },
      "clue": {
        "title": "Hinweis schreiben",
        "body": "„Freigeschaltete Information“ liest ein Team, nachdem es eine Aufgabe abgeschlossen hat. Schreib hier den Hinweis auf die versteckte Basis: ein Wahrzeichen, ein Rätsel, eine Richtung. Es gibt keinen Pin, nur diesen Text."
      },
      "readiness": {
        "title": "Versteckte Basen zählen mit",
        "body": "Die Startbereitschaft behandelt eine versteckte Basis wie jede andere: sie braucht eine funktionierende Check-in-Methode, bei NFC ein verknüpftes Tag. Klapp die Pille auf, um vor dem Livegang alles zu prüfen."
      }
    }
```

- [ ] **Step 5: Run the i18n test**

Run: `bun run --cwd packages/i18n test`
Expected: PASS. `keep every language in sync with English` catches any key you added to one file
only; `have no empty strings` catches a stub.

- [ ] **Step 6: Run both scenario test files — now fully green**

Run: `bun run --cwd web test -- src/features/tutorials/scenarios`
Expected: PASS, including the nine `has every copy key in <lang>` cases that failed in Tasks 3 and 4.

- [ ] **Step 7: Stage**

Stage: `git add packages/i18n/src/locales/en.json packages/i18n/src/locales/pt.json packages/i18n/src/locales/de.json`

---

### Task 6: Register the scenarios and verify their anchors

**Files:**
- Modify: `web/src/features/tutorials/scenarios/index.ts`
- Verify (normally unchanged): `web/src/features/tutorials/anchors.ts`

**Interfaces:**
- Consumes: `fixedRoute` and `exploration` from Tasks 3 and 4.
- Produces: `SCENARIOS` covers all three `ScenarioId`s; `scenarioList()` returns
  `[firstGame, fixedRoute, exploration]` in that order, straight out of phase 1's `SCENARIO_ORDER`.
  `anchors.ts` needs no change — Step 4 proves it.

- [ ] **Step 1: Write the failing test**

Add to `web/src/features/tutorials/scenarios/fixedRoute.test.ts`, as a new top-level `describe`:

```ts
describe('scenario registry', () => {
  it('registers all three scenarios in library order', async () => {
    const { SCENARIOS, scenarioList } = await import('./index')
    expect(Object.keys(SCENARIOS).sort()).toEqual(['exploration', 'first-game', 'fixed-route'])
    expect(scenarioList().map((s) => s.id)).toEqual(['first-game', 'fixed-route', 'exploration'])
    expect(SCENARIOS['fixed-route']).toBe(fixedRoute)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run --cwd web test -- src/features/tutorials/scenarios/fixedRoute.test.ts`
Expected: FAIL — `expect(received).toEqual(expected)` with only `['first-game']` registered.

- [ ] **Step 3: Register both scenarios**

Keep the file exactly as phases 1 and 2 left it: `SCENARIOS` stays
`Partial<Record<ScenarioId, Scenario>>`, and `SCENARIO_ORDER`, `registerScenario`, `getScenario`
and `scenarioList()` are unchanged. `SCENARIO_ORDER` is already
`['first-game', 'fixed-route', 'exploration']`, so `scenarioList()` returns library order the
moment both scenarios register. **Do not** rewrite `SCENARIOS` as a total `Record` and **do not**
replace `scenarioList()`.

The whole edit to `web/src/features/tutorials/scenarios/index.ts` is two imports and two calls,
added beside phase 2's `registerScenario(firstGame)` at the bottom of the file:

```ts
import { fixedRoute } from './fixedRoute'
import { exploration } from './exploration'
```

```ts
registerScenario(fixedRoute)
registerScenario(exploration)
```

- [ ] **Step 4: Confirm the anchor catalogue already covers both scenarios**

`web/src/features/tutorials/anchors.ts` keeps two arrays and an `isKnownAnchor()` that checks
both. Phases 1 and 2 already catalogued every anchor these two scenarios use, so this step is
normally a no-op verification:

```bash
grep -n "enforce-base-order-switch\|arrange-route-btn\|base-route-editor\|visibility-hidden\|map-wrapper\|save-base-btn\|completion-content\|readiness-indicator" web/src/features/tutorials/anchors.ts
grep -n "unlock-trigger-\|base-item-" web/src/features/tutorials/anchors.ts
```

Expected: the first grep prints eight `KNOWN_ANCHORS` entries; the second prints the two
`ANCHOR_PREFIXES` entries. **Append only what a grep does not find** — a static id goes in
`KNOWN_ANCHORS`, a template prefix (trailing `-`) goes in `ANCHOR_PREFIXES`, never the other way
round, because `isKnownAnchor()` does an exact match against `KNOWN_ANCHORS` and a `startsWith`
against `ANCHOR_PREFIXES`. Do not duplicate an entry that is already present.

- [ ] **Step 5: Run the whole tutorials suite**

Run: `bun run --cwd web test -- src/features/tutorials`
Expected: PASS, including phase 1–3 engine, store, host, welcome-card and library tests, which the
new registry entries must not break.

- [ ] **Step 6: Stage**

Stage: `git add web/src/features/tutorials/scenarios/index.ts web/src/features/tutorials/scenarios/fixedRoute.test.ts` (add `web/src/features/tutorials/anchors.ts` only if Step 4 actually changed it)

---

### Task 7: Offline Playwright walks

**Files:**
- Modify: `web/e2e/tutorials.spec.ts` (created in phase 2)

**Interfaces:**
- Consumes: the library test ids from the contract — `tutorials-page`, `tutorial-start-fixed-route`,
  `tutorial-start-exploration`, `setup-game-picker`, `setup-game-option-{gameId}` — and the tour ids
  `tour-bubble`, `tour-bubble-title`, `tour-next`.
- Produces: two named tests appended to the existing file. Do not touch the phase-2 `first-game` test.

Both tests run on both Playwright projects (`browser` at 1280×800 and `native-shell` at 390×844), so
assert on test ids and text, never on position. Reuse whatever login/route-mock helper phase 2 put at
the top of `tutorials.spec.ts`; the mock handler below is written standalone so it works either way.

- [ ] **Step 1: Write the fixed-route walk**

Append to `web/e2e/tutorials.spec.ts`:

```ts
test('the fixed-route tutorial walks from the library to the route editor', async ({ page }) => {
  const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
  const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`
  let game = { id: 'g', name: 'Ordered forest game', status: 'setup', description: '', createdBy: 'u', operatorIds: ['u'], enforceBaseOrder: false, uniformAssignment: false, broadcastEnabled: false, broadcastCode: null, tileSource: 'osm', unlockTrigger: 'CHECK_IN', startDate: null, endDate: null, defaultCheckInMethod: 'NFC', defaultCheckInRadiusM: 15 }
  const bases = ['Old mill', 'Lookout'].map((name, i) => ({ id: `b${i + 1}`, gameId: 'g', name, description: '', lat: 40 + i / 1000, lng: -8, nfcLinked: true, hidden: false, checkInMethod: 'NFC', checkInRadiusM: null }))
  const challenges = [{ id: 'c1', gameId: 'g', title: 'Count the arches', description: '', content: '<p>Count them.</p>', completionContent: '', answerType: 'text', autoValidate: false, points: 10, locationBound: false, requirePresenceToSubmit: false }]
  const progress: Array<{ scenarioId: string; status: string; currentStep: string | null; startedAt: string; completedAt: string | null }> = []

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 1 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 1 } } })
    if (path === '/api/users/me/tutorials') return route.fulfill({ json: progress })
    if (path.startsWith('/api/users/me/tutorials/')) {
      const body = route.request().postDataJSON() as { status: string; currentStep: string | null }
      const row = { scenarioId: path.split('/').pop()!, status: body.status, currentStep: body.currentStep, startedAt: '2026-09-06T09:00:00Z', completedAt: null }
      progress.splice(0, progress.length, row)
      return route.fulfill({ json: row })
    }
    if (path === '/api/games/g') {
      if (method === 'PUT') game = { ...game, ...route.request().postDataJSON() }
      return route.fulfill({ json: game })
    }
    if (path === '/api/games') return route.fulfill({ json: [game] })
    if (path === '/api/games/g/bases') return route.fulfill({ json: bases.map((b, i) => ({ ...b, sequenceNumber: game.enforceBaseOrder ? i + 1 : null })) })
    if (path === '/api/games/g/challenges') return route.fulfill({ json: challenges })
    return route.fulfill({ json: [] })
  })

  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.goto('/tutorials')
  await expect(page.getByTestId('tutorials-page')).toBeVisible()
  await page.getByTestId('tutorial-start-fixed-route').click()
  await page.getByTestId('setup-game-option-g').click()

  const title = page.getByTestId('tour-bubble-title')
  await expect(title).toHaveText('Turn on the route')

  await page.locator('[data-testid="enforce-base-order-switch"]:visible').click()
  await expect.poll(() => game.enforceBaseOrder).toBe(true)
  await expect(title).toHaveText('What unlocks the next base')

  await page.getByTestId('tour-next').click()
  await expect(title).toHaveText('Open the route editor')

  await page.locator('[data-testid="arrange-route-btn"]:visible').click()
  await expect(page.getByTestId('base-route-editor')).toBeVisible()
  await expect(title).toHaveText('Set the order')
  await expect(page.getByTestId('tour-bubble')).toBeVisible()
})
```

- [ ] **Step 2: Write the exploration walk**

Append to the same file. It reuses the same mock shape, plus a base `PUT` that persists `hidden`:

```ts
test('the exploration tutorial walks from the library to the saved hidden base', async ({ page }) => {
  const user = { id: 'u', name: 'Operator', email: 'operator@example.test', role: 'operator', createdAt: '2026-01-01' }
  const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`
  const game = { id: 'g', name: 'Hidden ruins', status: 'setup', description: '', createdBy: 'u', operatorIds: ['u'], enforceBaseOrder: false, uniformAssignment: false, broadcastEnabled: false, broadcastCode: null, tileSource: 'osm', unlockTrigger: 'CHECK_IN', startDate: null, endDate: null, defaultCheckInMethod: 'NFC', defaultCheckInRadiusM: 15 }
  let bases = ['Old mill', 'Lookout'].map((name, i) => ({ id: `b${i + 1}`, gameId: 'g', name, description: '', lat: 40 + i / 1000, lng: -8, nfcLinked: true, hidden: false, checkInMethod: 'NFC', checkInRadiusM: null }))
  const challenges = [{ id: 'c1', gameId: 'g', title: 'Count the arches', description: '', content: '<p>Count them.</p>', completionContent: '', answerType: 'text', autoValidate: false, points: 10, locationBound: false, requirePresenceToSubmit: false }]
  const progress: unknown[] = []

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (path.startsWith('/api/auth/')) return route.fulfill({ json: { accessToken: token, user } })
    if (path === '/api/workspaces') return route.fulfill({ json: { personal: { tier: 'free', status: 'active', activeGames: 1 }, organizations: [] } })
    if (path.startsWith('/api/quota/')) return route.fulfill({ json: { limits: { maxActiveGames: 10 }, usage: { currentActiveGames: 1 } } })
    if (path === '/api/users/me/tutorials') return route.fulfill({ json: progress })
    if (path.startsWith('/api/users/me/tutorials/')) return route.fulfill({ json: { scenarioId: path.split('/').pop(), status: 'in_progress', currentStep: null, startedAt: '2026-09-06T09:00:00Z', completedAt: null } })
    if (path === '/api/games/g') return route.fulfill({ json: game })
    if (path === '/api/games') return route.fulfill({ json: [game] })
    if (path === '/api/games/g/bases/b1' && method === 'PUT') {
      const body = route.request().postDataJSON() as { hidden?: boolean }
      bases = bases.map((b) => (b.id === 'b1' ? { ...b, ...body } : b))
      return route.fulfill({ json: bases.find((b) => b.id === 'b1') })
    }
    if (path === '/api/games/g/bases') return route.fulfill({ json: bases })
    if (path === '/api/games/g/challenges') return route.fulfill({ json: challenges })
    return route.fulfill({ json: [] })
  })

  await page.goto('/login')
  await page.getByTestId('login-email').fill(user.email)
  await page.getByTestId('login-password').fill('test-password')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.goto('/tutorials')
  await page.getByTestId('tutorial-start-exploration').click()
  await page.getByTestId('setup-game-option-g').click()

  const title = page.getByTestId('tour-bubble-title')
  await expect(title).toHaveText('Pick a base to hide')

  await page.locator('[data-testid="base-item-b1"]:visible').click()
  await expect(title).toHaveText('Hide it from the map')

  await page.locator('[data-testid="visibility-hidden"]:visible').click()
  await expect(title).toHaveText('Save the base')

  await page.locator('[data-testid="save-base-btn"]:visible').click()
  await expect.poll(() => bases.find((b) => b.id === 'b1')?.hidden).toBe(true)
  await expect(title).toHaveText('Write the clue')
  await expect(page.getByTestId('tour-bubble')).toBeVisible()
})
```

- [ ] **Step 3: Run the E2E file**

Run: `bun run --cwd web test:e2e -- tutorials`
Expected: PASS on both the `browser` and `native-shell` projects, phase 2's `first-game` test
included.

If a step stalls, read the failure before changing the scenario: the two most likely causes are the
mocked base `PUT` path (check the real path in `web/src/lib/api/bases.ts` and match it) and a
duplicate visible element for a test id (the `:visible` locators above exist because the workspace
renders desktop and mobile variants of the same controls).

- [ ] **Step 4: Stage**

Stage: `git add web/e2e/tutorials.spec.ts`

---

### Task 8: Documentation and the contract-deviation record

**Files:**
- Modify: `docs/visual-system/preview-matrix.md`
- Modify: `docs/business-logic.md`
- Modify: `docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md` (**never staged** —
  plans stay untracked)

**Interfaces:**
- Consumes: nothing.
- Produces: docs that name both scenarios, and a written record of deviations 1–5 for later phases.

- [ ] **Step 1: Extend the tutorials row in the preview matrix**

`docs/visual-system/preview-matrix.md` is a single table of `| Fixture | Web /dev/visual-system |
SwiftUI preview | Compose preview |` rows. Two tutorial rows exist by now: phase 1's component row
(its fixture text mentions `Spotlight` / `CoachBubble` / `TourPill`) and phase 2's scenario row
("Operator guided first game: welcome card, per-step coach marks…"). Edit **phase 2's scenario
row**, so the component row stays about components:

```
| Operator guided tutorials: welcome card, per-step coach marks, first-game, fixed-route, exploration | partial | n/a | n/a |
```

Keep that row's existing web/SwiftUI/Compose cells as phase 2 set them (`n/a` for the legacy apps —
the spec puts operator tutorials in `web/` only). Leave phase 1's component row untouched.

- [ ] **Step 2: Add two lines to business-logic.md**

Phase 3 created `## 9. Operator Onboarding and Tutorials` in `docs/business-logic.md` (moving
phase 2's subsection into it as `### The guided first game`). Append these two lines to the end of
that section:

```markdown
- **`fixed-route` tutorial** — a `setup-game` scenario that turns on `enforceBaseOrder`, explains the game-wide `unlockTrigger`, and opens the route editor. It teaches no new rule: every base already carries an `orderIndex` from creation, so `BaseOrderService.sequenceNumbers` always numbers the whole route and readiness has nothing to check.
- **`exploration` tutorial** — a `setup-game` scenario that hides one base and writes the clue into another challenge's completion text. It reflects the real player contract: `PlayerService.getProgress` omits a hidden, not-yet-visited base entirely, so it has no map pin and no list row, while a hidden `LOCATION` base still geofences because `buildCandidates` keeps hidden rows.
```

If `grep -n "Operator Onboarding" docs/business-logic.md` prints nothing, phase 3 was not merged —
stop and resolve that before continuing rather than creating a second onboarding home.

- [ ] **Step 3: Check the index still records these deviations**

`docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md` already carries the merged
"Contract deviations" list for all four phases. Confirm the five phase-4 entries are present:
`place-first`; `hide-save`; `aria-pressed` on the visibility buttons landing in phase 4;
`tutorials.fixedRoute.arrange.branch.needsTwoBases`; and `exploration.clue`'s `when` guard.
**Append** anything execution turns up that is missing — never replace the section, and never
`git add` the file (it is untracked on purpose).

- [ ] **Step 4: Stage the docs only**

Stage: `git add docs/visual-system/preview-matrix.md docs/business-logic.md`

---

### Task 9: Verify and commit

**Files:** none new.

- [ ] **Step 1: Typecheck**

Run: `bun run --cwd web typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Lint**

Run: `bun run --cwd web lint`
Expected: PASS, no new warnings. Scenario files are data — if the linter complains about unused
`TourState` imports, remove the import rather than disabling the rule.

- [ ] **Step 3: Focused Vitest**

Run: `bun run --cwd web test -- src/features/tutorials`
Expected: PASS.

Run: `bun run --cwd web test -- src/features/build/BaseDetail.test.tsx`
Expected: PASS.

- [ ] **Step 4: i18n**

Run: `bun run --cwd packages/i18n test`
Expected: PASS — key parity across en/pt/de and no empty strings.

- [ ] **Step 5: Full web unit suite**

Run: `bun run --cwd web test`
Expected: PASS. The `aria-pressed` change touches a shared screen, so this catches any base-detail
snapshot or query that relied on the old markup.

If the local toolchain is unavailable, substitute `make test-frontend-docker`.

- [ ] **Step 6: Design-system checks**

Run: `make design-system-check`
Expected: PASS.

Run: `make design-system-audit`
Expected: advisory output only; no new finding attributable to this change (no new component, no new
class, no new token).

- [ ] **Step 7: Offline E2E**

Run: `bun run --cwd web test:e2e -- tutorials`
Expected: PASS on `browser` and `native-shell`.

- [ ] **Step 8: Review what is staged**

Run: `git status --short` and `git diff --cached --stat`
Expected exactly these paths, and nothing under `docs/specs/` or `docs/superpowers/`:

```
web/src/features/build/BaseDetail.tsx
web/src/features/build/BaseDetail.test.tsx
web/src/features/tutorials/testState.ts
web/src/features/tutorials/scenarios/fixedRoute.ts
web/src/features/tutorials/scenarios/fixedRoute.test.ts
web/src/features/tutorials/scenarios/exploration.ts
web/src/features/tutorials/scenarios/exploration.test.ts
web/src/features/tutorials/scenarios/index.ts
packages/i18n/src/locales/en.json
packages/i18n/src/locales/pt.json
packages/i18n/src/locales/de.json
web/e2e/tutorials.spec.ts
docs/visual-system/preview-matrix.md
docs/business-logic.md
```

- [ ] **Step 9: Commit**

Run:

```
git commit -m "feat(web): fixed-route and exploration tutorials" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Expected: one commit whose parent is phase 3's commit. Verify with `git log --oneline -3` and
`git show --stat HEAD`.

---

## Self-review before handing the phase over

Walk this list and fix anything it catches.

### Spec coverage — `fixed-route` table

| Spec row | Where it lands | Deviation |
|---|---|---|
| 1 `enforce-base-order-switch`, prepare open settings, predicate `enforceBaseOrder` | `enable-order` | none |
| 2 `unlock-trigger-{current}`, ack | `unlock-trigger`, anchor `(s) => \`unlock-trigger-${s.game?.unlockTrigger ?? 'CHECK_IN'}\`` | none |
| 3 `arrange-route-btn`, prepare open drawer `bases`, predicate route editor open | `arrange`, predicate `s.field('base-route-editor').present` | branch copy added (dev. 4) |
| 4 `base-route-editor`, ack, "readiness now checks the route" | `route` | copy corrected (dev. 6) |
| 5 `readiness-indicator`, ack, marks completed | `readiness`, last step | copy corrected (dev. 7); completion is positional, no flag |

### Spec coverage — `exploration` table

| Spec row | Where it lands | Deviation |
|---|---|---|
| 1 `base-item-{firstId}`, prepare open drawer `bases`, predicate a base is selected | `pick-base` | `place-first` added ahead of it (dev. 1) |
| 2 `visibility-hidden`, predicate selected base hidden | split into `hide` + `hide-save` | dev. 2, 3 |
| 3 `challenge-content` (spec) / `completion-content` (task brief), prepare open linked or first challenge, ack | `clue`, anchor `completion-content` — the completion-text field, which is what the copy is about | `when` guard added (dev. 5); copy corrected (dev. 9) |
| 4 `readiness-indicator`, ack, marks completed | `readiness`, last step | none |

### Placeholder scan

- [ ] `grep -rn "TODO\|FIXME\|XXX\|placeholder" web/src/features/tutorials/scenarios/fixedRoute.ts web/src/features/tutorials/scenarios/exploration.ts` returns nothing.
- [ ] No i18n value is an English string sitting in `pt.json` or `de.json`.
- [ ] No `defaultValue:` fallbacks were added — every tutorial string comes from the catalog.
- [ ] Every body is under ~45 words and names one other thing on the screen. Check
      `enable-order` (settings panel contents), `unlock-trigger` (game-wide scope), `arrange`
      (search / list / edit), `route` (one route, per-team challenges), fixed-route `readiness`
      (the other checks), `place-first` (dragging markers), `pick-base` (search), `hide` (GPS
      geofence), `hide-save` (keep editing), `clue` (no pin to follow), exploration `readiness`
      (NFC tag linking).

### Name consistency with the index

- [ ] Scenario ids are exactly `fixed-route` and `exploration`.
- [ ] `fixed-route` step ids are exactly `enable-order`, `unlock-trigger`, `arrange`, `route`, `readiness`.
- [ ] File paths are `web/src/features/tutorials/scenarios/fixedRoute.ts` and `exploration.ts`.
- [ ] i18n keys are `tutorials.scenarios.fixedRoute.*`, `tutorials.scenarios.exploration.*`,
      `tutorials.fixedRoute.<stepId>.*`, `tutorials.exploration.<stepId>.*`.
- [ ] The scenarios import `Scenario` / `TourState` from `../types` and nothing from React.
- [ ] `TourActions` calls used are only `setMode`, `setSettingsPanelOpen`, `openDrawer`,
      `selectChallenge`, `setReadinessExpanded` — all on the contract's interface.
- [ ] Every `setMode` call is guarded by `if (s.mode !== 'build')`, and both scenario test files
      assert it (`never switches mode when the operator is already in build`).
- [ ] `advance()` is called id-in / id-out everywhere: `advance(scenario, s, NO_CLICKS, null)`
      for a fresh run, a step id to resume from, and `null` back when the scenario is finished.
      No test indexes into `effectiveSteps` with an `advance` result.
- [ ] Test ids used all exist in the app or in the contract's groundwork table; none was renamed.
- [ ] `scenarios/index.ts` still exports `SCENARIOS` as a `Partial<Record<...>>` plus
      `SCENARIO_ORDER`, `registerScenario`, `getScenario` and `scenarioList` — phase 4 only added
      two `registerScenario(...)` calls.
- [ ] `makeTourState` is imported from `../testState`; there is no `test/tourState.ts`.
- [ ] No `tutorials.scenarios.*` key was written here, and `contractKeys` in
      `packages/i18n/src/locales.test.ts` is untouched.
- [ ] Deviations 1–5 are present in the index's "Contract deviations" section (Task 8, Step 3).
