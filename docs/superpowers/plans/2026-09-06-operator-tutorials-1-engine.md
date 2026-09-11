# Operator tutorials — Phase 1: engine, spotlight and coach bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the whole tutorial machinery — pure engine, Zustand run store, DOM readers, mutation log, anchor tracking, `Spotlight` / `CoachBubble` / `TourPill`, and the `TourHost` mounted in the router root — plus every groundwork test id and store hoist the later phases depend on. Ship no scenario and no welcome card: after this phase nothing is visible to a user unless a test starts a scenario. That is intended and correct.

**Architecture:** Everything scenario-shaped lives in `web/src/features/tutorials/` and is pure or store-only: `engine.ts` is a set of pure functions over a `TourState` snapshot, `store.ts` holds one run, `dom.ts` reads live DOM fields so `predicate` steps can test what an operator typed before the form is saved, and `mutationLog.ts` turns TanStack mutation successes into timestamped keys so a step can say "the base save succeeded after this step started". Rendering lives in `web/src/components/tour/` — outside `features/` because the design-system audit flags `backdrop-blur` under `web/src/features` and `OverlayPanel` supplies it. `TourHost` sits in the pathless root route element next to `PushIntake` / `TagIntake`, so it has router context on every route, and it renders `null` (mounting no query hooks at all) until a scenario is active.

**Tech Stack:** React 19, TypeScript, Tailwind v4 semantic tokens, Zustand, TanStack Query v5 (`5.90.x`), react-router-dom v6, `motion/react` (Motion 12), react-i18next (`@pointfinder/i18n`), lucide-react, Vitest + Testing Library + MSW, Storybook 9 (`@storybook/react-vite`).

## Contract deviations

All recorded here and already merged into the "Contract deviations" section of
`docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md`. Do **not** edit the index yourself.

1. **`SCENARIOS` is `Partial<Record<ScenarioId, Scenario>>`, not `Record<ScenarioId, Scenario>`.** Phase 1 ships zero scenarios, so a total record is unrepresentable without placeholder objects. `web/src/features/tutorials/scenarios/index.ts` exports a mutable `SCENARIOS: Partial<Record<ScenarioId, Scenario>>`, a `registerScenario(scenario)` helper that phases 2 and 4 call at module scope, `getScenario(id): Scenario | undefined`, and `scenarioList(): Scenario[]` (ordered by `SCENARIO_ORDER`, missing entries dropped). Every consumer already has to handle "scenario not bundled", so no call site gets worse.
2. **`Switch` gains a `'data-testid'?: string` prop.** `web/src/components/ui/switch.tsx` destructures its props explicitly and does not spread, so `data-testid="enforce-base-order-switch"` on the enforce-base-order switch would be silently dropped at runtime. The prop is added to `SwitchProps` and forwarded to the rendered `<button>`. This is a one-line addition to a canonical component, not a new API surface.
3. **The run's position is a step **id**, not an index.** `TourStoreState.currentStepId: string | null` replaces `stepIndex: number`, `setCurrentStep(stepId)` replaces `setStepIndex(index)`, and `advance(scenario, s, clicked, fromStepId): string | null` replaces the index-in/index-out signature. A `when` guard can add or remove a step between renders, so an index silently means a different step from one frame to the next. `stepIndexOf(scenario, s, stepId)` is added for "step n of m". `start` gains an optional `stepId`, which is all Resume needs — phase 3 adds no separate resume field.
4. **`complete()` and `skip(scenarioId)` are store actions.** They are the only two places a `TutorialProgress` row is built, so the finish path and the welcome card's Skip both go through the store instead of hand-assembling a row in a component or an effect. `TourRunner` calls `complete()` when `advance` returns null.
5. **`TutorialProgress.gameId: string | null` lands in phase 1, not phase 3.** `complete()` writes it, so the field has to exist before the backend does. Phase 3 adds only the column, the DTO field and the wire plumbing behind it.
6. **`answer-type-group` is added to `ChallengeDetail`.** The three answer-type buttons had no wrapping element with a test id, so `pressedIn` had no group to read and a scenario could only spotlight one of the three options. A `data-testid` on the existing wrapper `<div>` fixes both; no class or behaviour changes.
7. **New semantic token `color.surface.tourScrim`.** The spotlight must not use the modal `surface.scrim`: a tour scrim never blocks, and dimming as hard as a dialog misdescribes that. The generator builds CSS names with `--pf-${path.replaceAll('.', '-')}` and does **not** kebab-case, so the variable is `--pf-color-surface-tourScrim` (matching the existing `--pf-color-action-primaryStrong`), not `--pf-color-surface-tour-scrim`.
8. **`SETTLE_MS` (600) and `INPUT_SETTLE_MS` (500) are exported constants.** `useAnchorRect` re-measures for `SETTLE_MS` after any trigger and watches `document.body` with a `MutationObserver`, because tour anchors mount late and then keep moving on a spring; `TourRunner` debounces `input`-driven advancement by `INPUT_SETTLE_MS` so a predicate never fires on a half-typed word. Both are exported so their tests can assert against the real value.

Everything else — file paths, type names, remaining engine signatures, `MUTATION_KEYS`, mutation keys, workspace store additions, test ids, layering and motion rules — matches the index contract exactly.

## Scope notes

- The index puts all `tutorials.*` i18n in phase 2. `CoachBubble` and `TourPill` ship in phase 1 and need button and step-counter labels, so **phase 1 adds only the `tutorials.common.*` block** (`stepOf`, `next`, `gotIt`, `later`, `close`, `resume`, `pillLabel`) to `en.json`, `pt.json` and `de.json` together. The key names are exactly the ones the contract lists. Phase 2 adds `tutorials.menu`, `tutorials.welcome.*`, `tutorials.scenarios.*` and every step key on top.
- `anchors.ts` is seeded in this phase with the full static-anchor list and template prefixes the spec's three scenarios use, because that file exists precisely so phase 2 and phase 4 scenario tests can assert their anchors are known. It asserts nothing about the live DOM in this phase.

## Global Constraints

- Never rename an existing `data-testid`, route, API path, query key, accessibility id, or Compose/Swift test tag. New ids only. The ids added here are exactly: `mode-build`, `mode-command`, `mode-review`, `mode-results`, `dashboard-empty-state`, `arrange-route-btn`, `enforce-base-order-switch`, `answer-type-group`, `tour-spotlight`, `tour-spotlight-hole`, `tour-bubble`, `tour-bubble-title`, `tour-bubble-body`, `tour-bubble-aside`, `tour-next`, `tour-later`, `tour-close`, `tour-pill`, `tour-pill-resume`, `harness-tutorials`.
- Tailwind: semantic tokens only. No raw hex anywhere in `web/src` (the audit greps `#[0-9a-fA-F]{6,8}`), no raw palette classes (`bg-red-500` and friends), no `rounded-2xl` / `rounded-3xl` / `shadow-xl` / `shadow-2xl`, and no `backdrop-blur` under `web/src/features` — blur only ever arrives through `OverlayPanel`. The tour scrim colour is the new `var(--pf-color-surface-tourScrim)` (Task 9 Step 1); `var(--pf-color-surface-scrim)` stays what dialogs and drawers use and is never touched here.
- Motion: `motion/react` only, always paired with `useReducedMotion()`. When reduced motion is on, pass `initial={false}` and a zero-duration transition. Standard duration 0.2 s, easing `[0.2, 0, 0, 1]`.
- Tour layer is `z-[70]` — above drawers/dialogs (`z-50`) and portalled menus (`z-[60]`), below toasts (`z-[100]`). `Spotlight` is `pointer-events-none` throughout; the scrim must never intercept a click.
- Every new i18n key lands in `packages/i18n/src/locales/en.json`, `pt.json` and `de.json` in the same change — `packages/i18n/src/locales.test.ts` enforces key parity and rejects empty strings.
- Compose canonical components only (`@/components/ui/*`, `@/components/layout/*`, `@/components/feedback/*`). No new inline primitives.
- Focused test command: `bun run --cwd web test -- <path>`. Package tests: `bun run --cwd packages/i18n test`.
- Phase gate: `bun run --cwd web typecheck`, `bun run --cwd web lint`, `bun run --cwd web test`, `bun run --cwd packages/i18n test`, `make design-system-check`, `make design-system-audit` (advisory), `bun run --cwd web build-storybook`.
- ONE atomic commit at the very end of the phase (Task 12), message `feat(web): tutorial engine, spotlight and coach bubble`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Every other task ends with a **Stage** step that runs `git add` on exact paths and nothing else. Never stage this plan file, anything under `docs/superpowers/`, or anything under `docs/specs/`.

## File map

| Path | Responsibility |
|---|---|
| `web/src/features/tutorials/types.ts` | Every shared type. No logic. |
| `web/src/features/tutorials/anchors.ts` | `KNOWN_ANCHORS`, `ANCHOR_PREFIXES`. Data only. |
| `web/src/features/tutorials/dom.ts` | Live-DOM readers: `anchorElement`, `isAnchorVisible`, `readAnchorField`, `pressedIn`. |
| `web/src/features/tutorials/engine.ts` | Pure: `effectiveSteps`, `isStepDone`, `advance`, `stepIndexOf`, `resolveAnchor`, `resolveBody`. |
| `web/src/features/tutorials/store.ts` | `useTourStore` — one run, not persisted. |
| `web/src/features/tutorials/mutationLog.ts` | `MUTATION_KEYS`, `subscribeMutationLog`. |
| `web/src/features/tutorials/scenarios/index.ts` | `SCENARIOS`, `registerScenario`, `getScenario`, `scenarioList`. |
| `web/src/features/tutorials/useTourState.ts` | Assembles `TourState` from queries + stores + DOM. |
| `web/src/features/tutorials/useTourActions.ts` | `TourActions` bound to the workspace store and the router. |
| `web/src/features/tutorials/TourHost.tsx` | Gate (`TourHost`) + runner (`TourRunner`). Owns listeners, advance, prepare, pill/bubble choice. |
| `web/src/components/tour/placement.ts` | Pure `placeBubble`, `readSafeInsets`. |
| `web/src/components/tour/useAnchorRect.ts` | Tracks the anchor element + rect + visibility. |
| `web/src/components/tour/Spotlight.tsx` | Portalled SVG mask. |
| `web/src/components/tour/CoachBubble.tsx` | `OverlayPanel` bubble / bottom sheet. |
| `web/src/components/tour/TourPill.tsx` | Collapsed state. |

---

### Task 1: Types, anchor catalogue and live-DOM readers

**Files:**
- Create `web/src/features/tutorials/types.ts`
- Create `web/src/features/tutorials/anchors.ts`
- Create `web/src/features/tutorials/dom.ts`
- Test: create `web/src/features/tutorials/dom.test.ts`

**Interfaces:**
- Produces `ScenarioId`, `ScenarioEntry`, `TutorialStatus`, `TutorialProgress`, `FieldReading`, `TourState`, `TourActions`, `StepDone`, `StepCopy`, `Step`, `Scenario` from `types.ts`.
- Produces `KNOWN_ANCHORS: readonly string[]`, `ANCHOR_PREFIXES: readonly string[]` from `anchors.ts`.
- Produces `anchorElement(testId: string): HTMLElement | null`, `isAnchorVisible(el: Element | null): boolean`, `readAnchorField(testId: string): FieldReading`, `pressedIn(groupTestId: string): string | null` from `dom.ts`.
- Consumes `Game`, `Base`, `Challenge`, `Team`, `Assignment` from `@/types` and `GameMode`, `DrawerTab` from `@/stores/workspace` (all already exported).

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/dom.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { anchorElement, isAnchorVisible, pressedIn, readAnchorField } from './dom'

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

function stubRect(el: Element, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('readAnchorField', () => {
  it('reads and trims an input value', () => {
    mount('<input data-testid="base-name-input" value="  Old mill  " />')
    expect(readAnchorField('base-name-input')).toEqual({ present: true, value: 'Old mill', pressed: null })
  })

  it('reads a textarea value', () => {
    const host = mount('<textarea data-testid="operator-notes"></textarea>')
    host.querySelector('textarea')!.value = 'Bring spare tags'
    expect(readAnchorField('operator-notes').value).toBe('Bring spare tags')
  })

  it('reads a ProseMirror contenteditable nested under the anchor', () => {
    mount(
      '<div data-testid="challenge-content"><div class="ProseMirror" contenteditable="true"><p>Count the arches</p></div></div>',
    )
    expect(readAnchorField('challenge-content')).toEqual({
      present: true,
      value: 'Count the arches',
      pressed: null,
    })
  })

  it('reads aria-pressed and aria-checked as a tri-state', () => {
    mount('<button data-testid="auto-validate-toggle" aria-pressed="true">Auto-validate</button>')
    expect(readAnchorField('auto-validate-toggle').pressed).toBe(true)

    document.body.innerHTML = ''
    mount('<button data-testid="auto-validate-toggle" aria-pressed="false">Auto-validate</button>')
    expect(readAnchorField('auto-validate-toggle').pressed).toBe(false)

    document.body.innerHTML = ''
    mount('<button data-testid="enforce-base-order-switch" role="switch" aria-checked="true"></button>')
    expect(readAnchorField('enforce-base-order-switch').pressed).toBe(true)
  })

  it('falls back to text content and reports a missing anchor', () => {
    mount('<div data-testid="team-join-code"> BRAVO-42 </div>')
    expect(readAnchorField('team-join-code').value).toBe('BRAVO-42')
    expect(readAnchorField('nope')).toEqual({ present: false, value: '', pressed: null })
  })
})

describe('pressedIn', () => {
  it('returns the test id of the pressed child', () => {
    mount(`
      <div data-testid="base-checkin-method">
        <button data-testid="base-checkin-method-nfc" aria-pressed="false"></button>
        <button data-testid="base-checkin-method-location" aria-pressed="true"></button>
      </div>
    `)
    expect(pressedIn('base-checkin-method')).toBe('base-checkin-method-location')
  })

  it('returns null when nothing is pressed or the group is absent', () => {
    mount('<div data-testid="base-checkin-method"><button aria-pressed="false"></button></div>')
    expect(pressedIn('base-checkin-method')).toBeNull()
    expect(pressedIn('missing-group')).toBeNull()
  })
})

describe('anchorElement and isAnchorVisible', () => {
  it('prefers the visible duplicate, as the desktop and mobile rails share ids', () => {
    const host = mount('<button data-testid="mode-build" id="desktop"></button><button data-testid="mode-build" id="mobile"></button>')
    const [desktop, mobile] = Array.from(host.querySelectorAll('button'))
    stubRect(desktop, { width: 0, height: 0, right: 0, bottom: 0 })
    stubRect(mobile, { top: 700, bottom: 744, left: 0, right: 44, width: 44, height: 44 })
    expect(anchorElement('mode-build')?.id).toBe('mobile')
  })

  it('treats a zero-sized or fully off-screen element as not visible', () => {
    const host = mount('<div data-testid="go-live-btn"></div>')
    const el = host.firstElementChild!
    stubRect(el, { width: 0, height: 0 })
    expect(isAnchorVisible(el)).toBe(false)
    stubRect(el, { top: -400, bottom: -300, left: 0, right: 100, width: 100, height: 100 })
    expect(isAnchorVisible(el)).toBe(false)
    stubRect(el, { top: 10, bottom: 50, left: 10, right: 100, width: 90, height: 40 })
    expect(isAnchorVisible(el)).toBe(true)
    expect(isAnchorVisible(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/tutorials/dom.test.ts
```

Expected: FAIL — `Failed to resolve import "./dom"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/features/tutorials/types.ts`:

```ts
import type { Assignment, Base, Challenge, Game, Team } from '@/types'
import type { DrawerTab, GameMode } from '@/stores/workspace'

export type ScenarioId = 'first-game' | 'fixed-route' | 'exploration'
export type ScenarioEntry = 'new-game' | 'setup-game'
export type TutorialStatus = 'in_progress' | 'completed' | 'skipped'

export interface TutorialProgress {
  scenarioId: ScenarioId
  status: TutorialStatus
  currentStep: string | null
  /**
   * Game a `setup-game` scenario is bound to, so Resume can return to it.
   * Null for `new-game` scenarios and for rows written before a game existed.
   * The client treats a missing or no-longer-in-setup game as "ask again".
   * Required from phase 1 because `useTourStore.complete()` and `skip()` build
   * this row; phase 3 only adds the column and the DTO field behind it.
   */
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
  games: Game[]
  game: Game | null
  bases: Base[]
  challenges: Challenge[]
  teams: Team[]
  assignments: Assignment[]
  /** failing = i18n labels of failed checks. */
  readiness: { allPassed: boolean; failing: string[] }
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
  /** testid of the aria-pressed=true child. */
  pressedIn: (groupTestId: string) => string | null
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
  /** i18n key. */
  title: string
  /** i18n key. */
  body: string
  /** i18n key. */
  aside?: string
  /** i18n key for the secondary "I'll do it later" button; presence renders the button. */
  later?: string
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
  /** i18n key. */
  title: string
  /** i18n key. */
  blurb: string
  steps: Step[]
}
```

Create `web/src/features/tutorials/anchors.ts`:

```ts
/**
 * Anchors are the contract between scenario files and screens. A scenario may
 * only point at an id listed here (static) or built from a prefix listed below
 * (template, e.g. `base-item-${id}`). Adding a scenario anchor means adding the
 * `data-testid` to the screen and the id to this catalogue in the same change.
 */
export const KNOWN_ANCHORS: readonly string[] = [
  'answer-type-group',
  'arrange-route-btn',
  'auto-assign-btn',
  'auto-validate-toggle',
  'base-checkin-method',
  'base-checkin-radius',
  'base-description-input',
  'base-lat-input',
  'base-name-input',
  'base-qr-print',
  'base-route-editor',
  'challenge-content',
  'challenge-description',
  'challenge-title-input',
  'completion-content',
  'correct-answer-input',
  'create-game-btn',
  'dashboard-empty-state',
  'enforce-base-order-switch',
  'go-live-btn',
  'link-challenge-btn',
  'location-bound-toggle',
  'map-wrapper',
  'mode-build',
  'mode-command',
  'mode-results',
  'mode-review',
  'new-entity-btn',
  'operator-notes',
  'points-input',
  'readiness-indicator',
  'revert-to-setup-btn',
  'save-base-btn',
  'save-challenge',
  'tab-nfc',
  'team-join-code',
  'visibility-hidden',
  'visibility-visible',
] as const

/** Template anchors: a scenario anchor may start with one of these and append an entity id. */
export const ANCHOR_PREFIXES: readonly string[] = [
  'answer-type-',
  'base-checkin-method-',
  'base-item-',
  'challenge-item-',
  'nfc-write-',
  'unlock-trigger-',
] as const

/** True when `anchor` is a catalogued static id or starts with a catalogued prefix. */
export function isKnownAnchor(anchor: string): boolean {
  return KNOWN_ANCHORS.includes(anchor) || ANCHOR_PREFIXES.some((prefix) => anchor.startsWith(prefix))
}
```

Create `web/src/features/tutorials/dom.ts`:

```ts
import type { FieldReading } from './types'

const MISSING: FieldReading = { present: false, value: '', pressed: null }

/** Zero-sized or entirely outside the viewport counts as "not there" for the tour. */
export function isAnchorVisible(el: Element | null): boolean {
  if (!el) return false
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth
}

/**
 * The desktop rail and the mobile tab bar carry the same ids and only one of
 * them is laid out at a time, so prefer the visible match and fall back to the
 * first one so callers can still tell "present but scrolled away" apart from
 * "not rendered".
 */
export function anchorElement(testId: string): HTMLElement | null {
  if (typeof document === 'undefined' || !testId || testId.includes('"')) return null
  const matches = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`))
  return matches.find((el) => isAnchorVisible(el)) ?? matches[0] ?? null
}

function readPressed(el: Element): boolean | null {
  const pressed = el.getAttribute('aria-pressed')
  if (pressed === 'true') return true
  if (pressed === 'false') return false
  const checked = el.getAttribute('aria-checked')
  if (checked === 'true') return true
  if (checked === 'false') return false
  return null
}

export function readAnchorField(testId: string): FieldReading {
  const el = anchorElement(testId)
  if (!el) return MISSING

  const pressed = readPressed(el)

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return { present: true, value: el.value.trim(), pressed }
  }

  const editable =
    el.getAttribute('contenteditable') === 'true'
      ? el
      : el.querySelector<HTMLElement>('[contenteditable="true"]')
  if (editable) return { present: true, value: (editable.textContent ?? '').trim(), pressed }

  const nested = el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  if (nested) return { present: true, value: nested.value.trim(), pressed }

  return { present: true, value: (el.textContent ?? '').trim(), pressed }
}

/** The `data-testid` of the pressed/checked control inside a segmented group. */
export function pressedIn(groupTestId: string): string | null {
  const group = anchorElement(groupTestId)
  if (!group) return null
  const pressed = group.querySelector<HTMLElement>('[aria-pressed="true"], [aria-checked="true"]')
  return pressed?.getAttribute('data-testid') ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/tutorials/dom.test.ts
bun run --cwd web typecheck
```

Expected: 10 passing assertions across 3 describes, typecheck clean.

- [ ] **Step 5: Stage** — no commit yet; this phase produces ONE commit in Task 12.

```bash
git add web/src/features/tutorials/types.ts web/src/features/tutorials/anchors.ts web/src/features/tutorials/dom.ts web/src/features/tutorials/dom.test.ts
```

---

### Task 2: Pure engine

**Files:**
- Create `web/src/features/tutorials/engine.ts`
- Test: create `web/src/features/tutorials/engine.test.ts`
- Create `web/src/features/tutorials/testState.ts` (shared `TourState` factory used by engine, store and host tests)

**Interfaces:**
- Consumes `Scenario`, `Step`, `TourState` from `./types`.
- Produces `effectiveSteps(scenario, s): Step[]`, `isStepDone(step, s, clicked): boolean`, `advance(scenario, s, clicked, fromStepId): string | null`, `stepIndexOf(scenario, s, stepId): number`, `resolveAnchor(step, s): string`, `resolveBody(step, s): string`.
- Produces `makeTourState(overrides?: Partial<TourState>): TourState` from `testState.ts`, used by Tasks 3 and 10.

> **Position is a step id, never an index.** `when` guards can add or remove a step
> between two renders, so an index means a different step from one frame to the next.
> `advance` therefore takes and returns a step **id**: the first step at or after
> `fromStepId` (in `effectiveSteps` order) that is not done, `null` when the scenario is
> finished. `null` as `fromStepId` means "start at the first effective step". When
> `fromStepId` has dropped out of the effective list (its `when` turned false), the search
> resumes at the first effective step whose position in the raw `scenario.steps` array is
> greater than `fromStepId`'s — so a vanished step never sends the run back to the top.
> `stepIndexOf` exists only to render "step n of m".

> `web/src/features/tutorials/testState.ts` is **the** shared `TourState` factory for the whole
> wave. Phases 2, 3 and 4 extend this file (new `TourState` fields, synthetic `field` /
> `pressedIn` overrides); none of them creates a second factory or a second path such as
> `test/tourState.ts`.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/testState.ts`:

```ts
import type { FieldReading, TourState } from './types'

const NO_FIELD: FieldReading = { present: false, value: '', pressed: null }

/**
 * A fully populated TourState with everything empty. Test-only, but it lives in
 * src (not src/test) because it is imported by tests in three folders.
 */
export function makeTourState(overrides: Partial<TourState> = {}): TourState {
  return {
    now: 1_000,
    startedAt: 0,
    scenarioId: 'first-game',
    gameId: null,
    routeGameId: null,
    isDashboard: false,
    isNative: false,
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
    field: () => NO_FIELD,
    pressedIn: () => null,
    ...overrides,
  }
}
```

Create `web/src/features/tutorials/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { advance, effectiveSteps, isStepDone, resolveAnchor, resolveBody, stepIndexOf } from './engine'
import { makeTourState } from './testState'
import type { Scenario, Step } from './types'

const copy = { title: 'tutorials.common.next', body: 'tutorials.common.gotIt' }

function predicateStep(id: string, test: Step['done'] extends never ? never : (s: ReturnType<typeof makeTourState>) => boolean): Step {
  return { id, anchor: `anchor-${id}`, done: { kind: 'predicate', test }, copy }
}

function ackStep(id: string): Step {
  return { id, anchor: `anchor-${id}`, done: { kind: 'ack' }, copy }
}

function clickStep(id: string): Step {
  return { id, anchor: `anchor-${id}`, done: { kind: 'click' }, copy }
}

function scenarioOf(steps: Step[]): Scenario {
  return {
    id: 'first-game',
    entry: 'new-game',
    title: 'tutorials.scenarios.firstGame.title',
    blurb: 'tutorials.scenarios.firstGame.blurb',
    steps,
  }
}

const NONE = new Set<string>()

describe('effectiveSteps', () => {
  it('keeps steps without a guard and drops guarded steps whose guard is false', () => {
    const scenario = scenarioOf([
      predicateStep('always', () => false),
      { ...predicateStep('qr-only', () => false), when: (s) => s.pressedIn('base-checkin-method') === 'base-checkin-method-qr' },
      { ...predicateStep('location-only', () => false), when: (s) => s.pressedIn('base-checkin-method') === 'base-checkin-method-location' },
    ])
    const state = makeTourState({ pressedIn: () => 'base-checkin-method-location' })

    expect(effectiveSteps(scenario, state).map((s) => s.id)).toEqual(['always', 'location-only'])
  })
})

describe('isStepDone', () => {
  it('runs the predicate for predicate steps', () => {
    const step = predicateStep('bases', (s) => s.bases.length >= 1)
    expect(isStepDone(step, makeTourState(), NONE)).toBe(false)
    expect(isStepDone(step, makeTourState({ bases: [{ id: 'b1' }] as never }), NONE)).toBe(true)
  })

  it('reads the clicked set for click steps', () => {
    const step = clickStep('base-qr')
    expect(isStepDone(step, makeTourState(), NONE)).toBe(false)
    expect(isStepDone(step, makeTourState(), new Set(['base-qr']))).toBe(true)
  })

  it('treats both an ack and a "later" as done for ack steps', () => {
    const step = ackStep('orient')
    expect(isStepDone(step, makeTourState(), NONE)).toBe(false)
    expect(isStepDone(step, makeTourState({ ackedSteps: new Set(['orient']) }), NONE)).toBe(true)
    expect(isStepDone(step, makeTourState({ laterSteps: new Set(['orient']) }), NONE)).toBe(true)
  })
})

describe('advance', () => {
  it('starts at the first effective step when there is no position yet', () => {
    const scenario = scenarioOf([predicateStep('a', () => false), ackStep('b')])
    expect(advance(scenario, makeTourState(), NONE, null)).toBe('a')
  })

  it('returns fromStepId when that step is still open', () => {
    const scenario = scenarioOf([predicateStep('a', () => true), predicateStep('b', () => false)])
    expect(advance(scenario, makeTourState(), NONE, 'b')).toBe('b')
  })

  it('skips ahead over predicate steps the operator already satisfied', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      predicateStep('b', (s) => s.bases.length >= 1),
      predicateStep('c', (s) => s.challenges.length >= 1),
      predicateStep('d', (s) => s.teams.length >= 1),
    ])
    const state = makeTourState({ bases: [{ id: 'b' }] as never, challenges: [{ id: 'c' }] as never })

    expect(advance(scenario, state, NONE, 'b')).toBe('d')
  })

  it('never auto-skips an ack step, even when later predicates already pass', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      ackStep('orient'),
      predicateStep('c', () => true),
    ])
    expect(advance(scenario, makeTourState(), NONE, 'orient')).toBe('orient')
  })

  it('never auto-skips a click step', () => {
    const scenario = scenarioOf([predicateStep('a', () => true), clickStep('base-qr')])
    expect(advance(scenario, makeTourState(), NONE, 'base-qr')).toBe('base-qr')
  })

  it('walks the filtered list, not the raw list', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      { ...predicateStep('skipped', () => false), when: () => false },
      ackStep('b'),
    ])
    expect(advance(scenario, makeTourState(), NONE, 'b')).toBe('b')
    expect(advance(scenario, makeTourState(), NONE, null)).toBe('b')
    expect(effectiveSteps(scenario, makeTourState())).toHaveLength(2)
  })

  it('when the current step drops out of the effective list, moves to the next later step', () => {
    const scenario = scenarioOf([
      predicateStep('a', () => true),
      { ...ackStep('gone'), when: () => false },
      ackStep('after'),
    ])
    // `gone` is not in effectiveSteps at all, so the search resumes at the first
    // effective step that sits after it in the raw list — never back at the top.
    expect(advance(scenario, makeTourState(), NONE, 'gone')).toBe('after')
  })

  it('returns null when everything is done', () => {
    const scenario = scenarioOf([predicateStep('a', () => true), predicateStep('b', () => true)])
    expect(advance(scenario, makeTourState(), NONE, null)).toBeNull()
    expect(advance(scenario, makeTourState(), NONE, 'b')).toBeNull()
  })

  it('returns null for an id that is in no list at all', () => {
    const scenario = scenarioOf([ackStep('a'), ackStep('b')])
    expect(advance(scenario, makeTourState(), NONE, 'not-a-step')).toBeNull()
  })
})

describe('stepIndexOf', () => {
  it('reports the position in the effective list, and -1 for an absent step', () => {
    const scenario = scenarioOf([
      ackStep('a'),
      { ...ackStep('hidden'), when: () => false },
      ackStep('b'),
    ])
    expect(stepIndexOf(scenario, makeTourState(), 'a')).toBe(0)
    expect(stepIndexOf(scenario, makeTourState(), 'b')).toBe(1)
    expect(stepIndexOf(scenario, makeTourState(), 'hidden')).toBe(-1)
    expect(stepIndexOf(scenario, makeTourState(), null)).toBe(-1)
  })
})

describe('resolveAnchor and resolveBody', () => {
  it('resolves a function anchor against state', () => {
    const step: Step = {
      id: 'edit',
      anchor: (s) => `challenge-item-${s.challenges[0]?.id ?? 'none'}`,
      done: { kind: 'ack' },
      copy,
    }
    expect(resolveAnchor(step, makeTourState())).toBe('challenge-item-none')
    expect(resolveAnchor(step, makeTourState({ challenges: [{ id: 'c9' }] as never }))).toBe('challenge-item-c9')
  })

  it('returns the first matching branch body and falls back to copy.body', () => {
    const step: Step = {
      id: 'go-live',
      anchor: 'go-live-btn',
      done: { kind: 'ack' },
      copy,
      branchCopy: [
        { when: (s) => s.laterSteps.has('base-nfc'), body: 'tutorials.firstGame.go-live.branch.deferredNfc' },
        { when: () => true, body: 'tutorials.firstGame.go-live.branch.fallback' },
      ],
    }
    expect(resolveBody(step, makeTourState({ laterSteps: new Set(['base-nfc']) }))).toBe(
      'tutorials.firstGame.go-live.branch.deferredNfc',
    )
    expect(resolveBody(step, makeTourState())).toBe('tutorials.firstGame.go-live.branch.fallback')
    expect(resolveBody({ id: 'x', anchor: 'a', done: { kind: 'ack' }, copy }, makeTourState())).toBe(
      'tutorials.common.gotIt',
    )
  })
})
```

Then simplify the helper at the top of that file — replace the `predicateStep` signature with the plain one so TypeScript is happy:

```ts
function predicateStep(id: string, test: (s: TourState) => boolean): Step {
  return { id, anchor: `anchor-${id}`, done: { kind: 'predicate', test }, copy }
}
```

and add `TourState` to the type import: `import type { Scenario, Step, TourState } from './types'`.

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/tutorials/engine.test.ts
```

Expected: FAIL — `Failed to resolve import "./engine"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/features/tutorials/engine.ts`:

```ts
import type { Scenario, Step, TourState } from './types'

/** Steps whose `when` guard passes, in scenario order. Positions are always taken in this list. */
export function effectiveSteps(scenario: Scenario, s: TourState): Step[] {
  return scenario.steps.filter((step) => (step.when ? step.when(s) : true))
}

export function isStepDone(step: Step, s: TourState, clicked: ReadonlySet<string>): boolean {
  switch (step.done.kind) {
    case 'predicate':
      return step.done.test(s)
    case 'click':
      return clicked.has(step.id)
    case 'ack':
      return s.ackedSteps.has(step.id) || s.laterSteps.has(step.id)
  }
}

/**
 * Position in the effective list, for "step n of m". -1 when the id is not
 * currently effective (or is null).
 */
export function stepIndexOf(scenario: Scenario, s: TourState, stepId: string | null): number {
  if (!stepId) return -1
  return effectiveSteps(scenario, s).findIndex((step) => step.id === stepId)
}

/**
 * First open step at or after `fromStepId`, as a step **id**. Only `predicate`
 * steps are skipped: an operator who did things out of order is not asked to redo
 * them, but an explanation the operator has not read yet is never jumped over.
 *
 * The position is an id and not an index because a `when` guard can add or drop a
 * step between two renders, which would silently move an index onto a different
 * step. `null` in means "start at the first effective step"; `null` out means the
 * scenario is finished.
 *
 * If `fromStepId` is no longer effective, the search resumes at the first effective
 * step that sits after it in the raw `scenario.steps` array, so a step whose guard
 * just turned false never sends the run back to the beginning.
 */
export function advance(
  scenario: Scenario,
  s: TourState,
  clicked: ReadonlySet<string>,
  fromStepId: string | null,
): string | null {
  const steps = effectiveSteps(scenario, s)
  if (steps.length === 0) return null

  let start = 0
  if (fromStepId) {
    const effectiveIndex = steps.findIndex((step) => step.id === fromStepId)
    if (effectiveIndex >= 0) {
      start = effectiveIndex
    } else {
      const rawIndex = scenario.steps.findIndex((step) => step.id === fromStepId)
      // An id from no list at all (a renamed step in a stale server row) ends the run
      // rather than restarting it from the top.
      if (rawIndex < 0) return null
      const resumed = steps.findIndex(
        (step) => scenario.steps.findIndex((raw) => raw.id === step.id) > rawIndex,
      )
      if (resumed < 0) return null
      start = resumed
    }
  }

  for (let index = start; index < steps.length; index += 1) {
    const step = steps[index]
    if (step.done.kind !== 'predicate') return step.id
    if (!isStepDone(step, s, clicked)) return step.id
  }
  return null
}

export function resolveAnchor(step: Step, s: TourState): string {
  return typeof step.anchor === 'function' ? step.anchor(s) : step.anchor
}

/** First matching branch body wins; otherwise the step's own body key. */
export function resolveBody(step: Step, s: TourState): string {
  return step.branchCopy?.find((branch) => branch.when(s))?.body ?? step.copy.body
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/tutorials/engine.test.ts
bun run --cwd web typecheck
```

Expected: all 16 tests pass, typecheck clean.

- [ ] **Step 5: Stage**

```bash
git add web/src/features/tutorials/engine.ts web/src/features/tutorials/engine.test.ts web/src/features/tutorials/testState.ts
```

---

### Task 3: Run store and the scenario registry

**Files:**
- Create `web/src/features/tutorials/store.ts`
- Create `web/src/features/tutorials/scenarios/index.ts`
- Test: create `web/src/features/tutorials/store.test.ts`

**Interfaces:**
- Produces `useTourStore` with state `activeScenario`, `gameId`, `currentStepId`, `paused`, `startedAt`, `ackedSteps`, `laterSteps`, `clickedSteps`, `stepCompletedAt`, `lastSuccess`, `tick`, `progress`, and actions `start`, `pause`, `resume`, `stop`, `complete`, `skip`, `ack`, `later`, `clicked`, `setCurrentStep`, `markStepCompleted`, `bindGame`, `recordSuccess`, `bumpTick`, `setProgress`, `reset`.

> The run's position is `currentStepId: string | null`, never an index — see the note in
> Task 2. `null` means "at the first effective step"; the host writes a real id on its
> first render. `start(scenarioId, opts?: { gameId?: string; stepId?: string })` accepts
> `stepId` so the tutorials library (phase 3) can resume a run at a named step without a
> second store field.
>
> `complete()` and `skip(scenarioId)` are the only two places that build a
> `TutorialProgress` row. Nothing else hand-assembles one: phase 2's welcome card calls
> `skip('first-game')`, and the host calls `complete()` when `advance` returns `null`.
> Phase 3's write-through then observes `progress` and sends it, so the finish and skip
> paths reach the server without a bespoke effect anywhere.
- Produces `SCENARIOS: Partial<Record<ScenarioId, Scenario>>`, `registerScenario(scenario): void`, `getScenario(id): Scenario | undefined`, `scenarioList(): Scenario[]`, `SCENARIO_ORDER: readonly ScenarioId[]`.
- Consumes `ScenarioId`, `Scenario`, `TutorialProgress` from `./types`.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useTourStore } from './store'
import { getScenario, registerScenario, scenarioList, SCENARIOS } from './scenarios'
import type { Scenario } from './types'

const probe: Scenario = {
  id: 'fixed-route',
  entry: 'setup-game',
  title: 'tutorials.scenarios.fixedRoute.title',
  blurb: 'tutorials.scenarios.fixedRoute.blurb',
  steps: [],
}

beforeEach(() => {
  useTourStore.getState().reset()
  delete SCENARIOS['fixed-route']
})

describe('tour store lifecycle', () => {
  it('starts clean and records the bound game and start time', () => {
    const before = Date.now()
    useTourStore.getState().start('first-game', { gameId: 'game-7' })
    const state = useTourStore.getState()

    expect(state.activeScenario).toBe('first-game')
    expect(state.gameId).toBe('game-7')
    expect(state.currentStepId).toBeNull()
    expect(state.paused).toBe(false)
    expect(state.startedAt).toBeGreaterThanOrEqual(before)
    expect(state.ackedSteps.size).toBe(0)
    expect(state.laterSteps.size).toBe(0)
    expect(state.clickedSteps.size).toBe(0)
  })

  it('can start at a named step, which is how Resume works', () => {
    useTourStore.getState().start('first-game', { gameId: 'game-7', stepId: 'go-live' })
    expect(useTourStore.getState().currentStepId).toBe('go-live')
  })

  it('start clears the leftovers of a previous run', () => {
    const s = useTourStore.getState()
    s.start('first-game')
    s.ack('orient')
    s.clicked('base-qr')
    s.setCurrentStep('base-save')
    s.markStepCompleted('orient', 123)

    useTourStore.getState().start('first-game')
    const state = useTourStore.getState()
    expect(state.currentStepId).toBeNull()
    expect(state.ackedSteps.size).toBe(0)
    expect(state.clickedSteps.size).toBe(0)
    expect(state.stepCompletedAt).toEqual({})
  })

  it('pauses and resumes without losing the position', () => {
    const s = useTourStore.getState()
    s.start('first-game')
    s.setCurrentStep('base-coords')
    s.pause()
    expect(useTourStore.getState().paused).toBe(true)
    useTourStore.getState().resume()
    expect(useTourStore.getState().paused).toBe(false)
    expect(useTourStore.getState().currentStepId).toBe('base-coords')
  })

  it('stop clears the run but keeps server progress', () => {
    const s = useTourStore.getState()
    s.setProgress([
      { scenarioId: 'first-game', status: 'in_progress', currentStep: 'orient', gameId: null, startedAt: '2026-09-06T10:00:00Z', completedAt: null },
    ])
    s.start('first-game')
    s.setCurrentStep('place-base')
    useTourStore.getState().stop()

    const state = useTourStore.getState()
    expect(state.activeScenario).toBeNull()
    expect(state.gameId).toBeNull()
    expect(state.currentStepId).toBeNull()
    expect(state.progress['first-game']?.currentStep).toBe('orient')
  })

  it('complete records a completed row, keeps the original start time and ends the run', () => {
    const s = useTourStore.getState()
    s.setProgress([
      { scenarioId: 'first-game', status: 'in_progress', currentStep: 'orient', gameId: null, startedAt: '2026-09-06T10:00:00Z', completedAt: null },
    ])
    s.start('first-game', { gameId: 'game-7' })
    useTourStore.getState().setCurrentStep('finish')
    useTourStore.getState().markStepCompleted('go-live-again', 1_000)
    useTourStore.getState().markStepCompleted('finish', 2_000)
    useTourStore.getState().complete()

    const row = useTourStore.getState().progress['first-game']!
    expect(row.status).toBe('completed')
    expect(row.currentStep).toBe('finish')
    expect(row.gameId).toBe('game-7')
    expect(row.startedAt).toBe('2026-09-06T10:00:00Z')
    expect(row.completedAt).not.toBeNull()
    expect(useTourStore.getState().activeScenario).toBeNull()
    expect(useTourStore.getState().currentStepId).toBeNull()
  })

  it('complete on a run with no prior row stamps its own start time', () => {
    useTourStore.getState().start('first-game')
    useTourStore.getState().setCurrentStep('finish')
    useTourStore.getState().complete()

    const row = useTourStore.getState().progress['first-game']!
    expect(row.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(row.gameId).toBeNull()
  })

  it('complete does nothing when no scenario is running', () => {
    useTourStore.getState().complete()
    expect(useTourStore.getState().progress).toEqual({})
  })

  it('skip records a skipped row without starting anything', () => {
    useTourStore.getState().skip('first-game')

    const row = useTourStore.getState().progress['first-game']!
    expect(row).toEqual({
      scenarioId: 'first-game',
      status: 'skipped',
      currentStep: null,
      gameId: null,
      startedAt: expect.any(String),
      completedAt: null,
    })
    expect(useTourStore.getState().activeScenario).toBeNull()
  })

  it('records acks, laters, clicks, completions, bound game, mutations and ticks', () => {
    const s = useTourStore.getState()
    s.start('first-game')
    s.ack('orient')
    s.later('base-nfc')
    s.clicked('base-qr')
    s.markStepCompleted('base-name', 5_000)
    s.bindGame('game-9')
    s.recordSuccess('base:update', 7_000)
    s.bumpTick()
    s.bumpTick()

    const state = useTourStore.getState()
    expect(state.ackedSteps.has('orient')).toBe(true)
    expect(state.laterSteps.has('base-nfc')).toBe(true)
    expect(state.clickedSteps.has('base-qr')).toBe(true)
    expect(state.stepCompletedAt['base-name']).toBe(5_000)
    expect(state.gameId).toBe('game-9')
    expect(state.lastSuccess['base:update']).toBe(7_000)
    expect(state.tick).toBe(2)
  })

  it('reset returns every field to its initial value', () => {
    const s = useTourStore.getState()
    s.start('first-game')
    s.ack('orient')
    s.recordSuccess('game:status', 1)
    useTourStore.getState().reset()

    const state = useTourStore.getState()
    expect(state.activeScenario).toBeNull()
    expect(state.lastSuccess).toEqual({})
    expect(state.tick).toBe(0)
    expect(state.progress).toEqual({})
  })
})

describe('scenario registry', () => {
  it('is empty in this phase and accepts registrations', () => {
    expect(scenarioList()).toEqual([])
    expect(getScenario('fixed-route')).toBeUndefined()

    registerScenario(probe)
    expect(getScenario('fixed-route')).toBe(probe)
    expect(scenarioList()).toEqual([probe])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/tutorials/store.test.ts
```

Expected: FAIL — `Failed to resolve import "./store"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/features/tutorials/store.ts`:

```ts
import { create } from 'zustand'
import type { ScenarioId, TutorialProgress } from './types'

interface TourStoreState {
  activeScenario: ScenarioId | null
  gameId: string | null
  /** Where the run is, as a step id. Null means "at the first effective step". */
  currentStepId: string | null
  paused: boolean
  startedAt: number
  ackedSteps: Set<string>
  laterSteps: Set<string>
  clickedSteps: Set<string>
  stepCompletedAt: Record<string, number>
  lastSuccess: Record<string, number>
  /** Bumped by the host's DOM input/change/click capture listeners so predicates re-read the DOM. */
  tick: number
  /** Hydrated from the server in phase 3; in-memory only until then. */
  progress: Partial<Record<ScenarioId, TutorialProgress>>
}

interface TourStoreActions {
  /** `stepId` starts the run at a named step — that is all "Resume" needs. */
  start: (scenarioId: ScenarioId, opts?: { gameId?: string; stepId?: string }) => void
  pause: () => void
  resume: () => void
  /** Clears the active run, keeps progress. */
  stop: () => void
  /** Marks the active scenario completed and clears the run. */
  complete: () => void
  /** Records a `skipped` row for a scenario that is not running. */
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

const initialState: TourStoreState = {
  activeScenario: null,
  gameId: null,
  currentStepId: null,
  paused: false,
  startedAt: 0,
  ackedSteps: new Set<string>(),
  laterSteps: new Set<string>(),
  clickedSteps: new Set<string>(),
  stepCompletedAt: {},
  lastSuccess: {},
  tick: 0,
  progress: {},
}

/** A fresh run. `lastSuccess` survives: it is a log of the app, not of the run. */
function freshRun(
  scenarioId: ScenarioId,
  gameId: string | null,
  stepId: string | null,
): Omit<TourStoreState, 'lastSuccess' | 'tick' | 'progress'> {
  return {
    activeScenario: scenarioId,
    gameId,
    currentStepId: stepId,
    paused: false,
    startedAt: Date.now(),
    ackedSteps: new Set<string>(),
    laterSteps: new Set<string>(),
    clickedSteps: new Set<string>(),
    stepCompletedAt: {},
  }
}

/** The run's cleared shape. `stop()` and `complete()` both end here. */
const clearedRun: Omit<TourStoreState, 'lastSuccess' | 'tick' | 'progress'> = {
  activeScenario: null,
  gameId: null,
  currentStepId: null,
  paused: false,
  startedAt: 0,
  ackedSteps: new Set<string>(),
  laterSteps: new Set<string>(),
  clickedSteps: new Set<string>(),
  stepCompletedAt: {},
}

/** The step whose completion was recorded last, for the `completed` row's `currentStep`. */
function lastCompletedStepId(stepCompletedAt: Record<string, number>): string | null {
  let best: string | null = null
  let bestAt = -Infinity
  for (const [stepId, at] of Object.entries(stepCompletedAt)) {
    if (at >= bestAt) {
      best = stepId
      bestAt = at
    }
  }
  return best
}

export const useTourStore = create<TourStoreState & TourStoreActions>()((set) => ({
  ...initialState,

  start: (scenarioId, opts) =>
    set(freshRun(scenarioId, opts?.gameId ?? null, opts?.stepId ?? null)),
  pause: () => set({ paused: true }),
  resume: () => set({ paused: false }),
  stop: () =>
    set({
      ...clearedRun,
      ackedSteps: new Set<string>(),
      laterSteps: new Set<string>(),
      clickedSteps: new Set<string>(),
      stepCompletedAt: {},
    }),

  // The one place a `completed` row is built. The host calls this when `advance`
  // returns null; phase 3's write-through observes `progress` and sends it.
  complete: () =>
    set((s) => {
      const scenarioId = s.activeScenario
      if (!scenarioId) return s
      const now = new Date().toISOString()
      const existing = s.progress[scenarioId]
      return {
        ...clearedRun,
        ackedSteps: new Set<string>(),
        laterSteps: new Set<string>(),
        clickedSteps: new Set<string>(),
        stepCompletedAt: {},
        progress: {
          ...s.progress,
          [scenarioId]: {
            scenarioId,
            status: 'completed',
            currentStep: lastCompletedStepId(s.stepCompletedAt) ?? s.currentStepId,
            gameId: s.gameId,
            startedAt:
              existing?.startedAt ?? new Date(s.startedAt || Date.now()).toISOString(),
            completedAt: now,
          },
        },
      }
    }),

  // The one place a `skipped` row is built. No run is involved: the welcome card
  // calls it without ever starting the scenario.
  skip: (scenarioId) =>
    set((s) => ({
      progress: {
        ...s.progress,
        [scenarioId]: {
          scenarioId,
          status: 'skipped',
          currentStep: null,
          gameId: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
        },
      },
    })),

  ack: (stepId) => set((s) => ({ ackedSteps: new Set(s.ackedSteps).add(stepId) })),
  later: (stepId) => set((s) => ({ laterSteps: new Set(s.laterSteps).add(stepId) })),
  clicked: (stepId) => set((s) => ({ clickedSteps: new Set(s.clickedSteps).add(stepId) })),
  setCurrentStep: (stepId) =>
    set((s) => (s.currentStepId === stepId ? s : { currentStepId: stepId })),
  markStepCompleted: (stepId, at) =>
    set((s) => (s.stepCompletedAt[stepId] === at ? s : { stepCompletedAt: { ...s.stepCompletedAt, [stepId]: at } })),
  bindGame: (gameId) => set({ gameId }),
  recordSuccess: (key, at) => set((s) => ({ lastSuccess: { ...s.lastSuccess, [key]: at } })),
  bumpTick: () => set((s) => ({ tick: s.tick + 1 })),
  setProgress: (rows) =>
    set(() => ({
      progress: rows.reduce<Partial<Record<ScenarioId, TutorialProgress>>>((acc, row) => {
        acc[row.scenarioId] = row
        return acc
      }, {}),
    })),
  reset: () =>
    set({
      ...initialState,
      ackedSteps: new Set<string>(),
      laterSteps: new Set<string>(),
      clickedSteps: new Set<string>(),
      stepCompletedAt: {},
      lastSuccess: {},
      progress: {},
    }),
}))
```

Create `web/src/features/tutorials/scenarios/index.ts`:

```ts
import type { Scenario, ScenarioId } from '../types'

/** Library display order. Phase 2 registers first-game; phase 4 registers the other two. */
export const SCENARIO_ORDER: readonly ScenarioId[] = ['first-game', 'fixed-route', 'exploration'] as const

/**
 * Deliberately partial: scenarios are registered by their own module as it is
 * imported, so a phase that has not shipped a scenario yet simply has no entry.
 */
export const SCENARIOS: Partial<Record<ScenarioId, Scenario>> = {}

export function registerScenario(scenario: Scenario): void {
  SCENARIOS[scenario.id] = scenario
}

export function getScenario(id: ScenarioId): Scenario | undefined {
  return SCENARIOS[id]
}

export function scenarioList(): Scenario[] {
  return SCENARIO_ORDER.map((id) => SCENARIOS[id]).filter((scenario): scenario is Scenario => Boolean(scenario))
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/tutorials/store.test.ts
bun run --cwd web typecheck
```

Expected: 13 tests pass.

- [ ] **Step 5: Stage**

```bash
git add web/src/features/tutorials/store.ts web/src/features/tutorials/store.test.ts web/src/features/tutorials/scenarios/index.ts
```

---

### Task 4: Mutation log and `mutationKey` on the nine hooks

**Files:**
- Create `web/src/features/tutorials/mutationLog.ts`
- Test: create `web/src/features/tutorials/mutationLog.test.ts`
- Modify `web/src/hooks/mutations/useBaseMutations.ts` (`useCreateBase`, `useUpdateBase`)
- Modify `web/src/hooks/mutations/useChallengeMutations.ts` (`useCreateChallenge`, `useUpdateChallenge`)
- Modify `web/src/hooks/mutations/useAssignmentMutations.ts` (`useCreateAssignment`, `useSetAssignments`)
- Modify `web/src/hooks/mutations/useGameMutations.ts` (`useCreateGame`, `useUpdateGame`, `useUpdateGameStatus`)

**Interfaces:**
- Produces `MUTATION_KEYS` (`baseCreate`, `baseUpdate`, `challengeCreate`, `challengeUpdate`, `assignmentsSet`, `assignmentsCreate`, `gameUpdate`, `gameStatus`, `gameCreate`) and `subscribeMutationLog(queryClient, record): () => void`.
- Consumes `QueryClient` from `@tanstack/react-query`.
- Consumed by `App.tsx` (Task 10) and by scenario predicates in phase 2.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/mutationLog.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { MUTATION_KEYS, subscribeMutationLog } from './mutationLog'

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } })
}

async function run(qc: QueryClient, options: { mutationKey?: unknown[]; fail?: boolean }) {
  const mutation = qc.getMutationCache().build(qc, {
    mutationKey: options.mutationKey as never,
    mutationFn: async () => {
      if (options.fail) throw new Error('boom')
      return 'ok'
    },
  })
  await mutation.execute(undefined).catch(() => undefined)
}

describe('subscribeMutationLog', () => {
  it('exposes the nine log keys the scenarios use', () => {
    expect(MUTATION_KEYS).toEqual({
      baseCreate: 'base:create',
      baseUpdate: 'base:update',
      challengeCreate: 'challenge:create',
      challengeUpdate: 'challenge:update',
      assignmentsSet: 'assignments:set',
      assignmentsCreate: 'assignments:create',
      gameUpdate: 'game:update',
      gameStatus: 'game:status',
      gameCreate: 'game:create',
    })
  })

  it('records a colon-joined key with a timestamp on success', async () => {
    const qc = client()
    const record = vi.fn()
    const unsubscribe = subscribeMutationLog(qc, record)

    await run(qc, { mutationKey: ['base', 'update'] })

    expect(record).toHaveBeenCalledWith('base:update', expect.any(Number))
    expect(record.mock.calls[0][1]).toBeGreaterThan(0)
    unsubscribe()
  })

  it('ignores failures and mutations without a two-string key', async () => {
    const qc = client()
    const record = vi.fn()
    const unsubscribe = subscribeMutationLog(qc, record)

    await run(qc, { mutationKey: ['base', 'update'], fail: true })
    await run(qc, { mutationKey: undefined })
    await run(qc, { mutationKey: ['bases'] })
    await run(qc, { mutationKey: ['bases', 'game-1', 'update'] })
    await run(qc, { mutationKey: ['bases', 7] })

    expect(record).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('stops recording after unsubscribe', async () => {
    const qc = client()
    const record = vi.fn()
    subscribeMutationLog(qc, record)()

    await run(qc, { mutationKey: ['game', 'status'] })

    expect(record).not.toHaveBeenCalled()
  })
})
```

Add to `web/src/hooks/mutations/useBaseMutations.test.ts` (append inside the existing top-level `describe`, or as a new one at the end of the file):

```ts
describe('base mutation keys', () => {
  it('tags create and update so the tutorial log can see them', () => {
    // The tutorial engine keys off ['base','create'] / ['base','update'];
    // renaming either breaks scenario predicates silently.
    expect(true).toBe(true)
  })
})
```

Replace that placeholder with a real assertion — create `web/src/hooks/mutations/mutationKeys.test.ts` instead, which asserts the real wiring end to end:

```ts
import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { subscribeMutationLog } from '@/features/tutorials/mutationLog'
import { useUpdateBase } from './useBaseMutations'
import { useUpdateGameStatus } from './useGameMutations'

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('mutation keys feed the tutorial log', () => {
  it('records base:update and game:status', async () => {
    server.use(
      http.put('/api/games/:gameId/bases/:baseId', () => HttpResponse.json(createMockBase({ id: 'b1' }))),
      http.put('/api/games/:gameId/status', () => HttpResponse.json({ id: 'game-1', status: 'live' })),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const seen: string[] = []
    const unsubscribe = subscribeMutationLog(queryClient, (key) => seen.push(key))

    const base = renderHook(() => useUpdateBase('game-1'), { wrapper: wrapper(queryClient) })
    base.result.current.mutate({ baseId: 'b1', dto: { name: 'Old mill' } })
    await waitFor(() => expect(seen).toContain('base:update'))

    const status = renderHook(() => useUpdateGameStatus('game-1'), { wrapper: wrapper(queryClient) })
    status.result.current.mutate({ status: 'live' })
    await waitFor(() => expect(seen).toContain('game:status'))

    unsubscribe()
  })
})
```

> If the status endpoint path in `web/src/lib/api/games.ts` differs from `/api/games/:gameId/status`, use the real one — read the file rather than guessing; the assertion is about the log key, not the URL.

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/tutorials/mutationLog.test.ts
bun run --cwd web test -- src/hooks/mutations/mutationKeys.test.ts
```

Expected: first FAILs with `Failed to resolve import "./mutationLog"`; second FAILs with `expected [] to contain 'base:update'` once the module exists.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/features/tutorials/mutationLog.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query'

/**
 * The keys a scenario predicate may compare against `TourState.lastSuccess`.
 * Each is the mutation's two-segment `mutationKey` joined with a colon.
 */
export const MUTATION_KEYS = {
  baseCreate: 'base:create',
  baseUpdate: 'base:update',
  challengeCreate: 'challenge:create',
  challengeUpdate: 'challenge:update',
  assignmentsSet: 'assignments:set',
  assignmentsCreate: 'assignments:create',
  gameUpdate: 'game:update',
  gameStatus: 'game:status',
  gameCreate: 'game:create',
} as const

export type MutationLogKey = (typeof MUTATION_KEYS)[keyof typeof MUTATION_KEYS]

/**
 * Watches the mutation cache and reports every successful mutation whose key is
 * exactly two strings. Returns the unsubscribe function.
 */
export function subscribeMutationLog(
  queryClient: QueryClient,
  record: (key: string, at: number) => void,
): () => void {
  return queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated') return
    const mutation = event.mutation
    if (!mutation || mutation.state.status !== 'success') return
    const key = mutation.options.mutationKey
    if (!Array.isArray(key) || key.length !== 2) return
    const [group, action] = key
    if (typeof group !== 'string' || typeof action !== 'string') return
    record(`${group}:${action}`, Date.now())
  })
}
```

In `web/src/hooks/mutations/useBaseMutations.ts`, add one line to each of the two hooks (leave `useDeleteBase` and `useReorderBases` untouched):

```ts
export function useCreateBase(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['base', 'create'],
    mutationFn: (dto: Omit<CreateBaseDto, 'gameId'>) =>
      basesApi.create({ ...dto, gameId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bases', gameId] }),
  })
}

export function useUpdateBase(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['base', 'update'],
    mutationFn: ({ baseId, dto }: { baseId: string; dto: Partial<CreateBaseDto> }) =>
      basesApi.update(baseId, { ...dto, gameId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bases', gameId] })
      qc.invalidateQueries({ queryKey: ['stages', gameId] })
    },
  })
}
```

In `web/src/hooks/mutations/useChallengeMutations.ts`, add `mutationKey: ['challenge', 'create'],` as the first option of `useCreateChallenge`'s `useMutation({ ... })` and `mutationKey: ['challenge', 'update'],` as the first option of `useUpdateChallenge`'s. Leave `useDeleteChallenge` and `useReorderChallenges` alone.

In `web/src/hooks/mutations/useAssignmentMutations.ts`, add `mutationKey: ['assignments', 'create'],` as the first option of `useCreateAssignment`'s `useMutation({ ... })` and `mutationKey: ['assignments', 'set'],` as the first option of `useSetAssignments`'s. Leave `useDeleteAssignment` alone.

In `web/src/hooks/mutations/useGameMutations.ts`, add `mutationKey: ['game', 'create'],` as the first option of `useCreateGame`'s `useMutation({ ... })`, `mutationKey: ['game', 'update'],` to `useUpdateGame`'s, and `mutationKey: ['game', 'status'],` to `useUpdateGameStatus`'s. Leave `useDeleteGame` and `useImportGame` alone.

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/tutorials/mutationLog.test.ts
bun run --cwd web test -- src/hooks/mutations/mutationKeys.test.ts
bun run --cwd web test -- src/hooks/mutations
```

Expected: the two new files pass and every pre-existing mutation test still passes (adding `mutationKey` changes nothing observable to them).

- [ ] **Step 5: Stage**

```bash
git add web/src/features/tutorials/mutationLog.ts web/src/features/tutorials/mutationLog.test.ts web/src/hooks/mutations/mutationKeys.test.ts web/src/hooks/mutations/useBaseMutations.ts web/src/hooks/mutations/useChallengeMutations.ts web/src/hooks/mutations/useAssignmentMutations.ts web/src/hooks/mutations/useGameMutations.ts
```

---

### Task 5: Workspace store additions and the readiness hoist

**Files:**
- Modify `web/src/stores/workspace.ts` (state interface, actions interface, `initialState`, store body)
- Modify `web/src/stores/workspace.test.ts` (append tests)
- Modify `web/src/features/build/ReadinessIndicator.tsx` (export `useReadinessChecks`, add `allPassed`, read `expanded` from the store)
- Modify `web/src/features/build/ReadinessIndicator.test.tsx` (append one test)

**Interfaces:**
- Produces workspace store state `readinessExpanded: boolean` and actions `setReadinessExpanded(open)`, `setSettingsPanelOpen(open)`.
- Produces `export function useReadinessChecks(gameId: string): ReadinessSummary` and `export interface ReadinessSummary { checks: ReadinessCheck[]; legacyNote: boolean; allPassed: boolean }` from `ReadinessIndicator.tsx`.
- Consumed by `useTourState` and `useTourActions` (Task 10).

- [ ] **Step 1: Write the failing test**

Append to `web/src/stores/workspace.test.ts`, inside the existing `describe('workspace store', ...)`:

```ts
  it('starts with the readiness panel collapsed and can expand it imperatively', () => {
    expect(useWorkspaceStore.getState().readinessExpanded).toBe(false)
    useWorkspaceStore.getState().setReadinessExpanded(true)
    expect(useWorkspaceStore.getState().readinessExpanded).toBe(true)
    useWorkspaceStore.getState().setReadinessExpanded(false)
    expect(useWorkspaceStore.getState().readinessExpanded).toBe(false)
  })

  it('opens and closes the settings panel imperatively, not only by toggling', () => {
    useWorkspaceStore.getState().setSettingsPanelOpen(true)
    expect(useWorkspaceStore.getState().settingsPanelOpen).toBe(true)
    useWorkspaceStore.getState().setSettingsPanelOpen(true)
    expect(useWorkspaceStore.getState().settingsPanelOpen).toBe(true)
    useWorkspaceStore.getState().setSettingsPanelOpen(false)
    expect(useWorkspaceStore.getState().settingsPanelOpen).toBe(false)
  })

  it('reset clears the readiness expansion', () => {
    useWorkspaceStore.getState().setReadinessExpanded(true)
    useWorkspaceStore.getState().reset()
    expect(useWorkspaceStore.getState().readinessExpanded).toBe(false)
  })
```

Append to `web/src/features/build/ReadinessIndicator.test.tsx` a new top-level describe (keep the existing imports; they already include `useWorkspaceStore`):

```tsx
describe('ReadinessIndicator expansion lives in the workspace store', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset()
    resetBaseCounter()
    resetChallengeCounter()
    resetTeamCounter()
    resetAssignmentCounter()
  })

  it('renders the checklist when the store says expanded, without a click', async () => {
    setupFullyReadyHandlers()
    useWorkspaceStore.getState().setReadinessExpanded(true)

    render(<ReadinessIndicator gameId="game-1" gameStatus="setup" />, { wrapper: createWrapper() })

    expect(await screen.findByTestId('readiness-checklist')).toBeInTheDocument()
  })

  it('writes the expansion back to the store when the header is pressed', async () => {
    setupFullyReadyHandlers()
    const user = userEvent.setup()

    render(<ReadinessIndicator gameId="game-1" gameStatus="setup" />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId('readiness-toggle'))
    await waitFor(() => expect(useWorkspaceStore.getState().readinessExpanded).toBe(true))
  })
})
```

> `createMockGame` is imported by the existing file but may be unused there; leave the imports as they are and only add what the new tests need. If `resetBaseCounter` and friends are not already imported at the top of that file, they are — the existing header imports all four.

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/stores/workspace.test.ts
bun run --cwd web test -- src/features/build/ReadinessIndicator.test.tsx
```

Expected: workspace FAILs with `setReadinessExpanded is not a function`; ReadinessIndicator FAILs on `Unable to find an element by: [data-testid="readiness-checklist"]`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/stores/workspace.ts`, add to `interface WorkspaceState` right after `settingsPanelOpen: boolean`:

```ts
  readinessExpanded: boolean
```

add to `interface WorkspaceActions` right after `toggleSettingsPanel: () => void`:

```ts
  setSettingsPanelOpen: (open: boolean) => void
  setReadinessExpanded: (open: boolean) => void
```

add to `initialState` right after `settingsPanelOpen: false,`:

```ts
  readinessExpanded: false,
```

and add to the store body right after the `toggleSettingsPanel` line:

```ts
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
  setReadinessExpanded: (open) => set({ readinessExpanded: open }),
```

In `web/src/features/build/ReadinessIndicator.tsx`:

Change the React import (line 1) from

```ts
import { useState, useMemo } from 'react'
```

to

```ts
import { useMemo } from 'react'
```

Export the summary shape and the hook, and add `allPassed`:

```ts
export interface ReadinessCheck {
  label: string
  passed: boolean
}

export interface ReadinessSummary {
  checks: ReadinessCheck[]
  /** True when any base uses a method the legacy Swift/Compose apps cannot play. */
  legacyNote: boolean
  /** Every check passes — the go-live gate. */
  allPassed: boolean
}

export function useReadinessChecks(gameId: string): ReadinessSummary {
```

(the two `interface` declarations above already exist unexported at lines 17–26 — add `export` to both and add the `allPassed` field; add `export` to `function useReadinessChecks`.)

At the end of the `useMemo` body, change the returned object from

```ts
    return {
      checks,
      legacyNote: baseList.some((b) => resolveCheckInMethod(b.checkInMethod) !== 'NFC'),
    }
```

to

```ts
    return {
      checks,
      legacyNote: baseList.some((b) => resolveCheckInMethod(b.checkInMethod) !== 'NFC'),
      allPassed: checks.every((check) => check.passed),
    }
```

In the component, replace

```ts
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const { checks, legacyNote } = useReadinessChecks(gameId)
```

with

```ts
  const { t } = useTranslation()
  const { checks, legacyNote, allPassed } = useReadinessChecks(gameId)
  const expanded = useWorkspaceStore((s) => s.readinessExpanded)
  const setReadinessExpanded = useWorkspaceStore((s) => s.setReadinessExpanded)
```

then delete the now-duplicated local derivation:

```ts
  const allPassed = passed === total
```

(keep `const passed = ...` and `const total = ...`; they still feed the ring), and change the toggle handler from

```tsx
            onClick={() => setExpanded((prev) => !prev)}
```

to

```tsx
            onClick={() => setReadinessExpanded(!expanded)}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/stores/workspace.test.ts
bun run --cwd web test -- src/features/build/ReadinessIndicator.test.tsx
bun run --cwd web typecheck
```

Expected: every existing readiness test still passes (they click `readiness-toggle`, which now writes to the store and re-renders the same way), plus the five new tests.

- [ ] **Step 5: Stage**

```bash
git add web/src/stores/workspace.ts web/src/stores/workspace.test.ts web/src/features/build/ReadinessIndicator.tsx web/src/features/build/ReadinessIndicator.test.tsx
```

---

### Task 6: Groundwork test ids, `aria-pressed` and the E2E helper switch

**Files:**
- Modify `web/src/components/layout/IconRail.tsx` (`ModeButton` props + both call sites)
- Modify `web/src/components/feedback/EmptyState.tsx` (props interface)
- Modify `web/src/components/ui/switch.tsx` (props interface + forward)
- Modify `web/src/features/dashboard/DashboardPage.tsx` (the `EmptyState` around line 107)
- Modify `web/src/features/build/BasesTab.tsx` (the "Arrange route" `Button` around line 133)
- Modify `web/src/features/build/GameSettingsPanel.tsx` (the enforce-base-order `Switch` around line 306)
- Modify `web/src/features/build/ChallengeDetail.tsx` (answer-type group wrapper + buttons ~352, auto-validate ~372, location-bound ~614)
- Modify `e2e/shared/web-helpers.ts` (`switchWorkspaceMode`)
- Test: create `web/src/components/layout/IconRail.anchors.test.tsx`

**Interfaces:**
- Produces the anchors `mode-build`, `mode-command`, `mode-review`, `mode-results`, `dashboard-empty-state`, `arrange-route-btn`, `enforce-base-order-switch`, `answer-type-group`, and `aria-pressed` on `answer-type-*`, `auto-validate-toggle`, `location-bound-toggle`.
- Produces `EmptyStateProps['data-testid']` and `SwitchProps['data-testid']`.
- Consumed by the scenarios in phases 2 and 4 and by `dom.pressedIn`.

> `answer-type-group` wraps the three answer-type buttons so `pressedIn('answer-type-group')`
> reads the chosen type the same way it reads the check-in method group, and so the tutorial
> can spotlight the whole control instead of one of its three options. It is a new id on an
> existing `<div>`; no class, layout or behaviour changes.
>
> `slide-drawer-close` is **not** added here: `web/src/components/layout/SlideDrawer.tsx`
> already carries it on the header close button (rendered only when a `title` is given), and
> `web/src/features/build/ContentDrawer.tsx` already carries `drawer-close` on the content
> panel's own close button. Both are existing ids; nothing to do beyond knowing which one a
> given drawer renders.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/layout/IconRail.anchors.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IconRail } from './IconRail'
import { useWorkspaceStore } from '@/stores/workspace'

function renderRail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <IconRail showModes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('IconRail tutorial anchors', () => {
  beforeEach(() => useWorkspaceStore.getState().reset())

  it('labels every mode button on both the desktop rail and the mobile bar', () => {
    renderRail()
    for (const mode of ['build', 'command', 'review', 'results']) {
      // one in the desktop rail, one in the mobile tab bar
      expect(screen.getAllByTestId(`mode-${mode}`)).toHaveLength(2)
    }
  })
})
```

Append to `web/src/features/build/ChallengeDetail.test.tsx` a focused describe. That file already
exists and already defines `createWrapper()` and renders
`<ChallengeDetail challengeId="challenge-1" gameId={gameId} />` — reuse both verbatim, and reuse the
file's existing `beforeEach` (it resets the four mock counters and the workspace store):

```tsx
describe('ChallengeDetail tutorial anchors', () => {
  it('reports the selected answer type and the two toggles through aria-pressed', async () => {
    const user = userEvent.setup()
    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    const textButton = await screen.findByTestId('answer-type-text')
    expect(textButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('answer-type-file')).toHaveAttribute('aria-pressed', 'false')

    // The group wrapper is what the tutorial spotlights and what `pressedIn` reads.
    const group = screen.getByTestId('answer-type-group')
    expect(group).toContainElement(textButton)
    expect(group.querySelector('[aria-pressed="true"]')?.getAttribute('data-testid')).toBe(
      'answer-type-text',
    )

    const autoValidate = screen.getByTestId('auto-validate-toggle')
    const before = autoValidate.getAttribute('aria-pressed')
    await user.click(autoValidate)
    expect(autoValidate.getAttribute('aria-pressed')).not.toBe(before)

    expect(screen.getByTestId('location-bound-toggle').getAttribute('aria-pressed')).toMatch(/true|false/)
  })
})
```

This describe goes at the end of the file, outside the existing top-level `describe('ChallengeDetail')`
block, so it gets its own `beforeEach` — copy the four `reset*Counter()` calls and
`useWorkspaceStore.getState().reset()` from the existing one.

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/components/layout/IconRail.anchors.test.tsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="mode-build"]`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/components/layout/IconRail.tsx`, give `ModeButton` a test id prop:

```tsx
function ModeButton({
  Icon,
  label,
  isActive,
  onClick,
  sizeClass,
  testId,
}: {
  Icon: typeof Hammer;
  label: string;
  isActive: boolean;
  onClick: () => void;
  sizeClass: string;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      data-testid={testId}
      className={cn(
        "relative flex items-center justify-center rounded-md transition-colors cursor-pointer",
        sizeClass,
        isActive
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-accent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon size={18} className={isActive ? "text-primary" : ""} />
    </button>
  );
}
```

and pass it at both call sites — the desktop rail:

```tsx
              <ModeButton
                key={mode}
                Icon={Icon}
                label={label}
                isActive={store.mode === mode}
                onClick={() => store.setMode(mode)}
                sizeClass="w-8 h-8"
                testId={`mode-${mode}`}
              />
```

and the mobile bar:

```tsx
              <ModeButton
                key={mode}
                Icon={Icon}
                label={label}
                isActive={store.mode === mode}
                onClick={() => store.setMode(mode)}
                sizeClass="w-full h-11"
                testId={`mode-${mode}`}
              />
```

In `web/src/components/feedback/EmptyState.tsx`, declare the attribute explicitly (the component already spreads `...props` onto the wrapper, so nothing else changes):

```tsx
interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  density?: 'compact' | 'default';
  'data-testid'?: string;
}
```

In `web/src/components/ui/switch.tsx`, accept and forward the id (contract deviation 2):

```tsx
interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ id, checked, onCheckedChange, className, disabled, 'data-testid': testId }, ref) => (
    <button
      ref={ref}
      id={id}
      role="switch"
      type="button"
      aria-checked={checked}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onCheckedChange(!checked)}
```

(the rest of the file is unchanged).

In `web/src/features/dashboard/DashboardPage.tsx`, add the id to the empty state:

```tsx
        <EmptyState
          data-testid="dashboard-empty-state"
          title={t('dashboard.noGamesYet')}
          description={t('dashboard.createYourFirst')}
```

In `web/src/features/build/BasesTab.tsx`, add the id to the "Arrange route" button in the list header:

```tsx
          <Button variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal" data-testid="arrange-route-btn"
            disabled={game.status !== 'setup' || isLoading || isError || bases.length < 2}
            onClick={() => { selectBase(null); setArranging(true) }}>
            {t('baseOrder.arrange', { defaultValue: 'Arrange route' })}
          </Button>
```

In `web/src/features/build/GameSettingsPanel.tsx`, add the id to the enforce-base-order switch:

```tsx
              <Switch id="enforce-base-order" data-testid="enforce-base-order-switch" checked={game.enforceBaseOrder ?? false}
                disabled={game.status !== 'setup' || updateGame.isPending}
```

In `web/src/features/build/ChallengeDetail.tsx`, add `aria-pressed` to the three controls and give
the answer-type row a group id. The row's wrapper (`<div className="flex gap-1.5">` around line 352)
becomes:

```tsx
            <div className="flex gap-1.5" data-testid="answer-type-group">
```

and each button inside it gains `aria-pressed`:

```tsx
                <button
                  key={at.value}
                  type="button"
                  onClick={() => setLocalAnswerType(at.value)}
                  aria-pressed={localAnswerType === at.value}
                  data-testid={`answer-type-${at.value}`}
```

auto-validate:

```tsx
            <button
              type="button"
              onClick={() => setLocalAutoValidate(!localAutoValidate)}
              aria-pressed={localAutoValidate}
              data-testid="auto-validate-toggle"
```

location-bound:

```tsx
        <button
          type="button"
          onClick={() => setLocalLocationBound(!localLocationBound)}
          aria-pressed={localLocationBound}
          data-testid="location-bound-toggle"
```

In `e2e/shared/web-helpers.ts`, switch `switchWorkspaceMode` from the aria label to the new id, keeping the visible-match rule (the desktop rail and the mobile bar share the id and only one is laid out):

```ts
/**
 * Switch workspace mode by clicking the mode button in the IconRail.
 * Both the desktop rail and the mobile tab bar carry `mode-{mode}`; only the
 * laid-out one is visible, so pick that.
 */
export async function switchWorkspaceMode(page: Page, mode: WorkspaceMode) {
  const modeBtn = page.locator(`[data-testid="mode-${mode}"]:visible`).first();
  await expect(modeBtn).toBeVisible({ timeout: 5_000 });
  await modeBtn.click();
  // Small wait for mode transition animation
  await page.waitForTimeout(300);
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/components/layout/IconRail.anchors.test.tsx
bun run --cwd web test -- src/features/build
bun run --cwd web test -- src/features/dashboard
bun run --cwd web typecheck
bun run --cwd web lint
```

Expected: new test passes; every build and dashboard test still passes. `switchWorkspaceMode` is only exercised by the full-stack E2E suite, which is not part of this phase's gate.

- [ ] **Step 5: Stage**

```bash
git add web/src/components/layout/IconRail.tsx web/src/components/layout/IconRail.anchors.test.tsx web/src/components/feedback/EmptyState.tsx web/src/components/ui/switch.tsx web/src/features/dashboard/DashboardPage.tsx web/src/features/build/BasesTab.tsx web/src/features/build/GameSettingsPanel.tsx web/src/features/build/ChallengeDetail.tsx web/src/features/build/ChallengeDetail.test.tsx e2e/shared/web-helpers.ts
```

---

### Task 7: `tutorials.common` localization

**Files:**
- Modify `packages/i18n/src/locales/en.json` (new top-level `tutorials` block at the end)
- Modify `packages/i18n/src/locales/pt.json`
- Modify `packages/i18n/src/locales/de.json`
- Modify `packages/i18n/src/locales.test.ts` (new contract describe)

**Interfaces:**
- Produces `tutorials.common.stepOf`, `.next`, `.gotIt`, `.later`, `.close`, `.resume`, `.pillLabel`.
- Consumed by `CoachBubble` and `TourPill` (Task 9).

- [ ] **Step 1: Write the failing test**

Append to `packages/i18n/src/locales.test.ts`:

```ts
describe('tutorial chrome vocabulary', () => {
  const contractKeys = [
    'tutorials.common.stepOf',
    'tutorials.common.next',
    'tutorials.common.gotIt',
    'tutorials.common.later',
    'tutorials.common.close',
    'tutorials.common.resume',
    'tutorials.common.pillLabel',
  ]

  it.each(['en', 'pt', 'de'] as const)('%s carries every tutorial chrome key', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const key of contractKeys) expect(paths.has(key)).toBe(true)
  })

  it.each(['en', 'pt', 'de'] as const)('%s interpolates the step counter', (lang) => {
    const bundle = resources[lang].translation as Record<string, Record<string, Record<string, string>>>
    expect(bundle.tutorials.common.stepOf).toContain('{{n}}')
    expect(bundle.tutorials.common.stepOf).toContain('{{total}}')
    expect(bundle.tutorials.common.pillLabel).toContain('{{n}}')
    expect(bundle.tutorials.common.pillLabel).toContain('{{total}}')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd packages/i18n test
```

Expected: FAIL — `expected false to be true` for every language, and a `TypeError` reading `common` of undefined in the interpolation test.

- [ ] **Step 3: Write minimal implementation**

Add a new top-level `"tutorials"` block at the end of each locale file, after the existing `"readiness"` block (mind the comma on the line before).

`packages/i18n/src/locales/en.json`:

```json
  "tutorials": {
    "common": {
      "stepOf": "Step {{n}} of {{total}}",
      "next": "Next",
      "gotIt": "Got it",
      "later": "I'll do it later",
      "close": "Close tutorial",
      "resume": "Resume",
      "pillLabel": "Tutorial · step {{n}} of {{total}}"
    }
  }
```

`packages/i18n/src/locales/pt.json`:

```json
  "tutorials": {
    "common": {
      "stepOf": "Passo {{n}} de {{total}}",
      "next": "Seguinte",
      "gotIt": "Percebi",
      "later": "Faço isto mais tarde",
      "close": "Fechar tutorial",
      "resume": "Retomar",
      "pillLabel": "Tutorial · passo {{n}} de {{total}}"
    }
  }
```

`packages/i18n/src/locales/de.json`:

```json
  "tutorials": {
    "common": {
      "stepOf": "Schritt {{n}} von {{total}}",
      "next": "Weiter",
      "gotIt": "Verstanden",
      "later": "Mache ich später",
      "close": "Tutorial schließen",
      "resume": "Fortsetzen",
      "pillLabel": "Tutorial · Schritt {{n}} von {{total}}"
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd packages/i18n test
```

Expected: the key-parity test, the no-empty-strings test, the check-in contract test and both new tests pass.

- [ ] **Step 5: Stage**

```bash
git add packages/i18n/src/locales/en.json packages/i18n/src/locales/pt.json packages/i18n/src/locales/de.json packages/i18n/src/locales.test.ts
```

---

### Task 8: Bubble placement and anchor-rect tracking

**Files:**
- Create `web/src/components/tour/placement.ts`
- Create `web/src/components/tour/useAnchorRect.ts`
- Test: create `web/src/components/tour/placement.test.ts`
- Test: create `web/src/components/tour/useAnchorRect.test.tsx`

**Interfaces:**
- Produces `Rect`, `Insets`, `BubbleSize`, `Viewport`, `Placement`, `placeBubble(anchor, bubble, viewport, safe, gap?): Placement`, `readSafeInsets(): Insets`.
- Produces `AnchorTracking { element: HTMLElement | null; rect: DOMRect | null; visible: boolean }` and `useAnchorRect(testId: string | null, tick?: number): AnchorTracking`.
- Consumes `anchorElement`, `isAnchorVisible` from `@/features/tutorials/dom`.
- Consumed by `CoachBubble` and `TourRunner`.

> Two things the naive version gets wrong, and this one must not:
>
> 1. **The anchor often does not exist yet.** A step's `prepare` opens a drawer or switches
>    mode, and the element it points at mounts a frame or two later. `ResizeObserver` cannot
>    observe an element that is not there, so a `MutationObserver` on `document.body` watches
>    for it arriving.
> 2. **The anchor keeps moving after it exists.** `SlideDrawer` animates in on a spring
>    (`damping: 30`, `stiffness: 300`, `web/src/components/layout/SlideDrawer.tsx`), so a rect
>    measured the moment the element mounts is wrong for the next few hundred ms and the
>    spotlight lands beside the control. After any trigger the hook therefore keeps measuring
>    once per animation frame for `SETTLE_MS = 600`.
>
> Measuring is cheap and idempotent: `setTracking` bails when the geometry is unchanged, so a
> settle window that catches nothing costs a handful of `getBoundingClientRect` calls and
> causes no re-render.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/tour/placement.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { placeBubble, readSafeInsets, type Insets } from './placement'

const noInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const viewport = { width: 1280, height: 800 }
const bubble = { width: 320, height: 200 }

describe('placeBubble', () => {
  it('sits to the right of the anchor when there is room', () => {
    const result = placeBubble({ top: 100, left: 100, width: 60, height: 40 }, bubble, viewport, noInsets)
    expect(result.side).toBe('right')
    expect(result.left).toBe(172) // 100 + 60 + 12
    expect(result.top).toBe(100)
  })

  it('flips to the left when the right edge would overflow', () => {
    const result = placeBubble({ top: 100, left: 1100, width: 60, height: 40 }, bubble, viewport, noInsets)
    expect(result.side).toBe('left')
    expect(result.left).toBe(768) // 1100 - 12 - 320
  })

  it('drops below when neither side fits', () => {
    const result = placeBubble({ top: 100, left: 0, width: 1280, height: 40 }, bubble, viewport, noInsets)
    expect(result.side).toBe('below')
    expect(result.top).toBe(152) // 100 + 40 + 12
    expect(result.left).toBe(480) // centred: 0 + 1280/2 - 160
  })

  it('clamps the top inside the safe area', () => {
    const insets: Insets = { top: 48, right: 0, bottom: 34, left: 0 }
    const high = placeBubble({ top: -20, left: 100, width: 60, height: 40 }, bubble, viewport, insets)
    expect(high.top).toBe(56) // safe.top + 8

    const low = placeBubble({ top: 780, left: 100, width: 60, height: 40 }, bubble, viewport, insets)
    expect(low.top).toBe(800 - 34 - 8 - 200)
  })

  it('clamps the left inside the safe area when it drops below', () => {
    const insets: Insets = { top: 0, right: 20, bottom: 0, left: 20 }
    const result = placeBubble({ top: 100, left: 0, width: 1280, height: 40 }, { width: 1280, height: 200 }, viewport, insets)
    expect(result.left).toBe(28) // safe.left + 8
  })
})

describe('readSafeInsets', () => {
  it('returns zeroes when the CSS variables are unset', () => {
    expect(readSafeInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})
```

Create `web/src/components/tour/useAnchorRect.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { SETTLE_MS, useAnchorRect } from './useAnchorRect'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function Probe({ testId, tick }: { testId: string | null; tick?: number }) {
  const { element, rect, visible } = useAnchorRect(testId, tick)
  return (
    <div
      data-testid="probe"
      data-present={element ? 'yes' : 'no'}
      data-visible={visible ? 'yes' : 'no'}
      data-geometry={rect ? `${rect.left},${rect.top},${rect.width},${rect.height}` : 'none'}
    />
  )
}

function stubRect(el: Element, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('useAnchorRect', () => {
  it('measures a present anchor', () => {
    const anchor = document.createElement('button')
    anchor.setAttribute('data-testid', 'go-live-btn')
    document.body.appendChild(anchor)
    stubRect(anchor, { top: 40, left: 24, right: 224, bottom: 80, width: 200, height: 40 })

    render(<Probe testId="go-live-btn" />)

    expect(screen.getByTestId('probe')).toHaveAttribute('data-present', 'yes')
    expect(screen.getByTestId('probe')).toHaveAttribute('data-visible', 'yes')
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '24,40,200,40')
  })

  it('reports nothing for a missing anchor and for a null test id', () => {
    render(<Probe testId="not-here" />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-present', 'no')
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', 'none')

    render(<Probe testId={null} />)
    expect(screen.getAllByTestId('probe')[1]).toHaveAttribute('data-present', 'no')
  })

  it('re-measures when the tick changes', () => {
    const anchor = document.createElement('button')
    anchor.setAttribute('data-testid', 'save-base-btn')
    document.body.appendChild(anchor)
    stubRect(anchor, { top: 10, left: 10, right: 60, bottom: 30, width: 50, height: 20 })

    const view = render(<Probe testId="save-base-btn" tick={0} />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '10,10,50,20')

    stubRect(anchor, { top: 90, left: 10, right: 60, bottom: 110, width: 50, height: 20 })
    act(() => {
      view.rerender(<Probe testId="save-base-btn" tick={1} />)
    })
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '10,90,50,20')
  })

  it('re-measures on a capture-phase scroll', () => {
    const anchor = document.createElement('button')
    anchor.setAttribute('data-testid', 'map-wrapper')
    document.body.appendChild(anchor)
    stubRect(anchor, { top: 300, left: 0, right: 100, bottom: 340, width: 100, height: 40 })

    render(<Probe testId="map-wrapper" />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '0,300,100,40')

    stubRect(anchor, { top: 100, left: 0, right: 100, bottom: 140, width: 100, height: 40 })
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '0,100,100,40')
  })

  it('finds an anchor that appears after mount', async () => {
    // A step's `prepare` opens a drawer; the element it points at mounts later.
    // jsdom implements MutationObserver, so this is the real thing, not a stub.
    render(<Probe testId="late-anchor" />)
    expect(screen.getByTestId('probe')).toHaveAttribute('data-present', 'no')

    act(() => {
      const anchor = document.createElement('button')
      anchor.setAttribute('data-testid', 'late-anchor')
      stubRect(anchor, { top: 20, left: 30, right: 130, bottom: 60, width: 100, height: 40 })
      document.body.appendChild(anchor)
    })

    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-present', 'yes'),
    )
    expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '30,20,100,40')
  })

  it('keeps re-measuring for a short settle window after a scroll', () => {
    vi.useFakeTimers()
    try {
      const anchor = document.createElement('button')
      anchor.setAttribute('data-testid', 'save-base-btn')
      document.body.appendChild(anchor)
      stubRect(anchor, { top: 300, left: 0, right: 100, bottom: 340, width: 100, height: 40 })

      render(<Probe testId="save-base-btn" />)
      expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '0,300,100,40')

      // The scroll fires while a spring-animated panel is still moving, so the rect
      // the event itself sees is not the final one.
      act(() => {
        window.dispatchEvent(new Event('scroll'))
      })
      stubRect(anchor, { top: 120, left: 0, right: 100, bottom: 160, width: 100, height: 40 })
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '0,120,100,40')

      // Past the window it stops: nothing untriggered keeps polling forever.
      act(() => {
        vi.advanceTimersByTime(SETTLE_MS + 200)
      })
      stubRect(anchor, { top: 999, left: 0, right: 100, bottom: 1039, width: 100, height: 40 })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(screen.getByTestId('probe')).toHaveAttribute('data-geometry', '0,120,100,40')
    } finally {
      vi.useRealTimers()
    }
  })
})
```

> The settle test installs fake timers itself rather than in `beforeEach`, because
> `@sinonjs/fake-timers` (what `vi.useFakeTimers()` uses) fakes `requestAnimationFrame` and
> `Date.now` together — which is exactly what drives the loop — but would also freeze the
> `waitFor` in the "appears after mount" case.

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/components/tour/placement.test.ts
bun run --cwd web test -- src/components/tour/useAnchorRect.test.tsx
```

Expected: both FAIL with `Failed to resolve import`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/tour/placement.ts`:

```ts
export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface BubbleSize {
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export interface Placement {
  left: number
  top: number
  side: 'right' | 'left' | 'below'
}

const EDGE = 8

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Places the coach bubble beside its anchor: right first, then left, then
 * below. Pure so the collision rules can be tested without a browser.
 */
export function placeBubble(
  anchor: Rect,
  bubble: BubbleSize,
  viewport: Viewport,
  safe: Insets,
  gap = 12,
): Placement {
  const minLeft = safe.left + EDGE
  const maxLeft = viewport.width - safe.right - EDGE - bubble.width
  const minTop = safe.top + EDGE
  const maxTop = viewport.height - safe.bottom - EDGE - bubble.height

  const rightLeft = anchor.left + anchor.width + gap
  if (rightLeft + bubble.width <= viewport.width - safe.right - EDGE) {
    return { left: rightLeft, top: clamp(anchor.top, minTop, maxTop), side: 'right' }
  }

  const leftLeft = anchor.left - gap - bubble.width
  if (leftLeft >= minLeft) {
    return { left: leftLeft, top: clamp(anchor.top, minTop, maxTop), side: 'left' }
  }

  const centred = anchor.left + anchor.width / 2 - bubble.width / 2
  return {
    left: clamp(centred, minLeft, maxLeft),
    top: clamp(anchor.top + anchor.height + gap, minTop, maxTop),
    side: 'below',
  }
}

function readVar(style: CSSStyleDeclaration, name: string): number {
  const parsed = Number.parseFloat(style.getPropertyValue(name))
  return Number.isFinite(parsed) ? parsed : 0
}

/** The four `--safe-*` measurements the app already maintains, in CSS pixels. */
export function readSafeInsets(): Insets {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }
  const style = window.getComputedStyle(document.documentElement)
  return {
    top: readVar(style, '--safe-top'),
    right: readVar(style, '--safe-right'),
    bottom: readVar(style, '--safe-bottom'),
    left: readVar(style, '--safe-left'),
  }
}
```

Create `web/src/components/tour/useAnchorRect.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { anchorElement, isAnchorVisible } from '@/features/tutorials/dom'

export interface AnchorTracking {
  element: HTMLElement | null
  rect: DOMRect | null
  visible: boolean
}

const EMPTY: AnchorTracking = { element: null, rect: null, visible: false }

/**
 * How long to keep re-measuring after anything moves. `SlideDrawer` animates on a
 * spring (damping 30, stiffness 300), so an anchor inside it is still travelling
 * for a few hundred milliseconds after it mounts; a single measurement would park
 * the spotlight next to the control instead of over it.
 */
export const SETTLE_MS = 600

function sameRect(a: DOMRect | null, b: DOMRect): boolean {
  return (
    a !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
  )
}

/**
 * Tracks the element carrying `testId`: its live rect, whether it is on screen,
 * and the element itself so focus can return to it. Mirrors the floating-menu
 * approach in `components/ui/dropdown-menu.tsx` — ResizeObserver plus
 * capture-phase scroll and resize — and adds the two things a tour needs that a
 * menu does not: a `MutationObserver` so an anchor that mounts later is found at
 * all, and a short re-measure loop so a moving anchor is followed until it stops.
 * `tick` re-runs the whole thing when the engine nudges it after a DOM edit.
 */
export function useAnchorRect(testId: string | null, tick = 0): AnchorTracking {
  const [tracking, setTracking] = useState<AnchorTracking>(EMPTY)
  const frame = useRef(0)
  const settleUntil = useRef(0)

  const measure = useCallback(() => {
    const element = testId ? anchorElement(testId) : null
    if (!element) {
      setTracking((prev) => (prev.element === null ? prev : EMPTY))
      return
    }
    const rect = element.getBoundingClientRect()
    const visible = isAnchorVisible(element)
    setTracking((prev) =>
      prev.element === element && prev.visible === visible && sameRect(prev.rect, rect)
        ? prev
        : { element, rect, visible },
    )
  }, [testId])

  /**
   * Extend the settle window and make sure the per-frame loop is running. Does not
   * measure synchronously, so a noisy source (the MutationObserver) costs nothing
   * beyond a timestamp write.
   */
  const nudge = useCallback(() => {
    settleUntil.current = Date.now() + SETTLE_MS
    if (frame.current) return
    const step = () => {
      measure()
      if (Date.now() < settleUntil.current) {
        frame.current = requestAnimationFrame(step)
      } else {
        frame.current = 0
      }
    }
    frame.current = requestAnimationFrame(step)
  }, [measure])

  /** Measure now, then keep measuring for the settle window. */
  const remeasure = useCallback(() => {
    measure()
    nudge()
  }, [measure, nudge])

  useEffect(() => {
    remeasure()

    const element = testId ? anchorElement(testId) : null
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure)
    if (resize && element) resize.observe(element)

    // The anchor may not exist yet: a step's `prepare` opens a drawer or switches
    // mode and the element mounts a frame or two later. Nothing else notices that.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(nudge)
    mutations?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-testid', 'hidden'],
    })

    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = 0
      settleUntil.current = 0
      resize?.disconnect()
      mutations?.disconnect()
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [nudge, remeasure, testId, tick])

  return tracking
}
```

The loop cannot run away: `measure` only calls `setTracking` when the geometry actually
changed, so a settle window that catches nothing triggers no re-render, and a re-render it
does trigger does not restart the window — only a real trigger does.

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/components/tour/placement.test.ts
bun run --cwd web test -- src/components/tour/useAnchorRect.test.tsx
bun run --cwd web typecheck
```

Expected: 5 placement tests and 6 anchor-rect tests pass.

- [ ] **Step 5: Stage**

```bash
git add web/src/components/tour/placement.ts web/src/components/tour/placement.test.ts web/src/components/tour/useAnchorRect.ts web/src/components/tour/useAnchorRect.test.tsx
```

---

### Task 9: The tour scrim token, `Spotlight`, `CoachBubble`, `TourPill` and their stories

**Files:**
- Modify `design-system/tokens.json` (`color.light.surface.tourScrim`, `color.dark.surface.tourScrim`)
- Regenerate (do not hand-edit): `web/src/generated/design-tokens.css`, `web/src/generated/designTokens.ts`, `web/src/generated/colorValues.ts`, `ios-app/dbv-nfc-games/App/Theme/GeneratedDesignTokens.swift`, `ios-app/dbv-nfc-games/App/Theme/GeneratedColorValues.swift`, `android-app/core/designsystem/src/main/kotlin/com/prayer/pointfinder/core/designsystem/GeneratedDesignTokens.kt`, `android-app/core/designsystem/src/main/kotlin/com/prayer/pointfinder/core/designsystem/GeneratedColorValues.kt`
- Create `web/src/components/tour/Spotlight.tsx`
- Create `web/src/components/tour/CoachBubble.tsx`
- Create `web/src/components/tour/TourPill.tsx`
- Create `web/src/components/tour/Spotlight.stories.tsx`
- Create `web/src/components/tour/CoachBubble.stories.tsx`
- Create `web/src/components/tour/TourPill.stories.tsx`
- Test: create `web/src/components/tour/Spotlight.test.tsx`
- Test: create `web/src/components/tour/CoachBubble.test.tsx`
- Test: create `web/src/components/tour/TourPill.test.tsx`

**Interfaces:**
- Produces the semantic token `color.surface.tourScrim` and the CSS variable it generates.
- Produces `Spotlight({ rect, padding?, radius? })`, `CoachBubble(props)` and `TourPill({ step, total, onResume, inline? })`.
- `CoachBubbleProps`: `{ title: string; body: string; aside?: string; step: number; total: number; onAck?: () => void; onLater?: () => void; onClose: () => void; anchorRect: DOMRect | null; isLast?: boolean; inline?: boolean }`. `onAck` present renders `tour-next`; `onLater` present renders `tour-later`; `isLast` flips the primary label from Next to Got it.
- Consumes `placeBubble`, `readSafeInsets`, `OverlayPanel`, `Button`, `useMediaQuery`, `motion/react`.

- [ ] **Step 1: Add the tour scrim token and regenerate the adapters**

The tour scrim is not the modal scrim. A dialog's scrim says "deal with me first"; the tour's
says "look here, but carry on" — the whole point of the feature is that the operator can ignore
the bubble and keep working. `color.surface.scrim` is 60 % in light and 70 % in dark, which
reads as blocking. The tour gets its own, lighter value.

In `design-system/tokens.json`, add `tourScrim` to **both** themes' `surface` objects — the
generator's `test.mjs` asserts `light` and `dark` carry identical leaf paths, so one without the
other fails `make design-system-check`. Light (`color.light.surface`) becomes:

```json
      "surface": { "canvas": { "$value": "#f7f8f5" }, "panel": { "$value": "#ffffff" }, "overlay": { "$value": "#fffffff2" }, "subtle": { "$value": "#eef1ec" }, "inverse": { "$value": "#18201a" }, "map": { "$value": "#dfe5da" }, "scrim": { "$value": "#10171299" }, "tourScrim": { "$value": "#1017124d" } },
```

and dark (`color.dark.surface`):

```json
      "surface": { "canvas": { "$value": "#0d120f" }, "panel": { "$value": "#151c17" }, "overlay": { "$value": "#151c17f2" }, "subtle": { "$value": "#202923" }, "inverse": { "$value": "#edf3ed" }, "map": { "$value": "#101a14" }, "scrim": { "$value": "#000000b3" }, "tourScrim": { "$value": "#00000080" } },
```

(`4d` is 30 % of the same ink the modal scrim uses; `80` is 50 % black.)

Then regenerate every checked-in adapter — never hand-edit a generated file:

```
make design-system-generate
```

Expected: it prints one `generated <path>` line per output. Seven of them contain colour tokens
and therefore change: the three under `web/src/generated/`, the two Swift theme files, and the
two Kotlin design-system files. The others are byte-identical and are rewritten with the same
content.

Confirm the CSS variable's exact name before using it — `generate.mjs` builds it with
`--pf-${path.replaceAll('.', '-')}` and does **not** kebab-case, so a camelCase token key stays
camelCase (`color.action.primaryStrong` is already `--pf-color-action-primaryStrong`):

```
grep -n "tourScrim" web/src/generated/design-tokens.css
```

Expected: two lines, `--pf-color-surface-tourScrim: #1017124d;` under `:root` and
`--pf-color-surface-tourScrim: #00000080;` under `.dark`. `Spotlight` uses exactly
`var(--pf-color-surface-tourScrim)`.

Then check nothing drifted:

```
make design-system-check
```

Expected: `validated <n> token leaves, …` followed by no `stale:` line, exit 0.

`design-system/decisions.md` records **exceptions** — a component that deliberately breaks a
rule, or a migration left half-done. A new semantic token in the canonical file is neither, so
add no row there. (Read the file to confirm the convention before deciding otherwise.)

- [ ] **Step 2: Write the failing test**

Create `web/src/components/tour/Spotlight.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spotlight } from './Spotlight'

function rectOf(top: number, left: number, width: number, height: number): DOMRect {
  return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Spotlight', () => {
  it('renders nothing without a rect', () => {
    render(<Spotlight rect={null} />)
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument()
  })

  it('cuts a padded hole over the anchor and never intercepts clicks', () => {
    render(<Spotlight rect={rectOf(100, 200, 160, 40)} />)

    const root = screen.getByTestId('tour-spotlight')
    expect(root.className).toContain('pointer-events-none')
    expect(root.className).toContain('z-[70]')
    expect(root).toHaveAttribute('aria-hidden', 'true')

    const hole = screen.getByTestId('tour-spotlight-hole')
    expect(hole).toHaveAttribute('x', '192')
    expect(hole).toHaveAttribute('y', '92')
    expect(hole).toHaveAttribute('width', '176')
    expect(hole).toHaveAttribute('height', '56')
    expect(hole).toHaveAttribute('rx', '8')
  })

  it('dims with the tour scrim, not the modal scrim', () => {
    render(<Spotlight rect={rectOf(0, 0, 10, 10)} />)
    const fill = screen.getByTestId('tour-spotlight').querySelector('rect[mask]')
    expect(fill).toHaveAttribute('fill', 'var(--pf-color-surface-tourScrim)')
  })

  it('portals to the document body so no stacking context can trap it', () => {
    const { container } = render(<Spotlight rect={rectOf(0, 0, 10, 10)} />)
    expect(container).toBeEmptyDOMElement()
    expect(document.body.querySelector('[data-testid="tour-spotlight"]')).not.toBeNull()
  })
})
```

Create `web/src/components/tour/CoachBubble.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CoachBubble } from './CoachBubble'

const LONG_DE =
  'Tippe auf die Karte an der Stelle, an der die Teams später ankommen sollen, und wähle anschließend „Basis hier platzieren“, damit die Basis mit den Koordinaten dieses Punktes angelegt wird.'

function renderBubble(overrides: Partial<React.ComponentProps<typeof CoachBubble>> = {}) {
  const props = {
    title: 'Place your first base',
    body: 'Tap the map where players should go.',
    step: 3,
    total: 12,
    onClose: vi.fn(),
    anchorRect: null,
    ...overrides,
  }
  return { props, ...render(<CoachBubble {...props} />) }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('CoachBubble', () => {
  it('renders the step counter, title and body', () => {
    renderBubble()
    expect(screen.getByTestId('tour-bubble-title')).toHaveTextContent('Place your first base')
    expect(screen.getByTestId('tour-bubble-body')).toHaveTextContent('Tap the map where players should go.')
    expect(screen.getByTestId('tour-bubble')).toHaveTextContent('Step 3 of 12')
  })

  it('renders the aside only when there is one', () => {
    renderBubble()
    expect(screen.queryByTestId('tour-bubble-aside')).not.toBeInTheDocument()

    document.body.innerHTML = ''
    renderBubble({ aside: 'Players never see scores.' })
    expect(screen.getByTestId('tour-bubble-aside')).toHaveTextContent('Players never see scores.')
  })

  it('renders Next only for ack steps and Got it on the last step', async () => {
    const onAck = vi.fn()
    renderBubble()
    expect(screen.queryByTestId('tour-next')).not.toBeInTheDocument()

    document.body.innerHTML = ''
    const user = userEvent.setup()
    renderBubble({ onAck })
    await user.click(screen.getByTestId('tour-next'))
    expect(screen.getByTestId('tour-next')).toHaveTextContent('Next')
    expect(onAck).toHaveBeenCalledTimes(1)

    document.body.innerHTML = ''
    renderBubble({ onAck, isLast: true })
    expect(screen.getByTestId('tour-next')).toHaveTextContent('Got it')
  })

  it('renders the later action only when a handler is supplied', async () => {
    const onLater = vi.fn()
    renderBubble()
    expect(screen.queryByTestId('tour-later')).not.toBeInTheDocument()

    document.body.innerHTML = ''
    const user = userEvent.setup()
    renderBubble({ onLater })
    await user.click(screen.getByTestId('tour-later'))
    expect(screen.getByTestId('tour-later')).toHaveTextContent("I'll do it later")
    expect(onLater).toHaveBeenCalledTimes(1)
  })

  it('closes from the close control and from Escape inside the bubble', async () => {
    const user = userEvent.setup()
    const { props } = renderBubble()
    await user.click(screen.getByTestId('tour-close'))
    expect(props.onClose).toHaveBeenCalledTimes(1)

    // Focus is inside the bubble (the close control it was just clicked on), so
    // Escape belongs to the tour.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores Escape when focus is somewhere else on the page', () => {
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    const { props } = renderBubble()

    outside.focus()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Escape belongs to whatever the operator is actually in — a dialog, a menu,
    // a combobox. The tour never steals it from across the page.
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('never takes focus away from something the operator is typing in', () => {
    const input = document.createElement('input')
    input.setAttribute('data-testid', 'outside-input')
    document.body.appendChild(input)
    input.focus()

    const props = {
      title: 'Name the base',
      body: 'Players see this name.',
      step: 4,
      total: 12,
      onClose: vi.fn(),
      anchorRect: null,
    }
    const view = render(<CoachBubble {...props} />)
    expect(document.activeElement).toBe(input)

    // A predicate step advances while the operator is mid-word; re-rendering with
    // the next step must not yank the caret out of the field.
    view.rerender(<CoachBubble {...props} title="Describe it" step={5} />)
    expect(document.activeElement).toBe(input)
  })

  it('is an accessible, focused, polite dialog', () => {
    renderBubble()
    const bubble = screen.getByTestId('tour-bubble')
    expect(bubble).toHaveAttribute('role', 'dialog')
    expect(bubble).toHaveAttribute('aria-live', 'polite')
    expect(bubble.getAttribute('aria-labelledby')).toBe(screen.getByTestId('tour-bubble-title').id)
    expect(screen.getByTestId('tour-close')).toHaveAttribute('aria-label', 'Close tutorial')
    expect(document.activeElement).toBe(bubble)
  })

  it('is a bottom sheet when the desktop media query does not match', () => {
    // the shared test setup stubs matchMedia to always report matches: false
    renderBubble()
    expect(screen.getByTestId('tour-bubble')).toHaveAttribute('data-variant', 'sheet')
  })

  it('survives long German copy without dropping the controls', () => {
    renderBubble({ body: LONG_DE, onAck: vi.fn(), onLater: vi.fn() })
    expect(screen.getByTestId('tour-bubble-body')).toHaveTextContent('Basis hier platzieren')
    expect(screen.getByTestId('tour-next')).toBeInTheDocument()
    expect(screen.getByTestId('tour-later')).toBeInTheDocument()
  })
})
```

Create `web/src/components/tour/TourPill.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TourPill } from './TourPill'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('TourPill', () => {
  it('shows where the operator is and resumes on demand', async () => {
    const user = userEvent.setup()
    const onResume = vi.fn()
    render(<TourPill step={4} total={12} onResume={onResume} />)

    expect(screen.getByTestId('tour-pill')).toHaveTextContent('Tutorial · step 4 of 12')
    await user.click(screen.getByTestId('tour-pill-resume'))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('sits on the tour layer and portals to the body', () => {
    const { container } = render(<TourPill step={1} total={3} onResume={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    expect(document.body.querySelector('[data-testid="tour-pill"]')?.className).toContain('z-[70]')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```
bun run --cwd web test -- src/components/tour/Spotlight.test.tsx
bun run --cwd web test -- src/components/tour/CoachBubble.test.tsx
bun run --cwd web test -- src/components/tour/TourPill.test.tsx
```

Expected: all three FAIL with `Failed to resolve import`.

- [ ] **Step 4: Write minimal implementation**

Create `web/src/components/tour/Spotlight.tsx`:

```tsx
import { useId } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'

export interface SpotlightProps {
  /** Viewport-relative rect of the anchor; null renders nothing. */
  rect: DOMRect | null
  /** Breathing room around the anchor, in CSS pixels. */
  padding?: number
  /** Corner radius of the cut-out. */
  radius?: number
}

/**
 * A full-viewport scrim with the anchor punched out. Purely decorative: it is
 * `pointer-events-none` end to end, so the operator can still click anything —
 * the tour dims, it never blocks. It fills with `surface.tourScrim`, which is
 * deliberately lighter than the modal `surface.scrim`: this scrim invites, it
 * does not demand.
 */
export function Spotlight({ rect, padding = 8, radius = 8 }: SpotlightProps) {
  const reduced = useReducedMotion()
  const maskId = useId()

  if (!rect || typeof document === 'undefined') return null

  const x = Math.max(0, rect.left - padding)
  const y = Math.max(0, rect.top - padding)
  const width = Math.max(0, rect.width + padding * 2)
  const height = Math.max(0, rect.height + padding * 2)

  return createPortal(
    <motion.div
      data-testid="tour-spotlight"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70]"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? undefined : { opacity: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
    >
      <svg className="h-full w-full" role="presentation" focusable="false">
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              data-testid="tour-spotlight-hole"
              x={x}
              y={y}
              width={width}
              height={height}
              rx={radius}
              ry={radius}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="var(--pf-color-surface-tourScrim)"
          mask={`url(#${maskId})`}
        />
      </svg>
    </motion.div>,
    document.body,
  )
}
```

Create `web/src/components/tour/CoachBubble.tsx`:

```tsx
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/ui/useMediaQuery'
import { cn } from '@/lib/utils'
import { placeBubble, readSafeInsets, type Placement } from './placement'

const BUBBLE_WIDTH = 320
const FALLBACK_HEIGHT = 200

export interface CoachBubbleProps {
  /** Already-translated title. */
  title: string
  /** Already-translated body. */
  body: string
  /** Already-translated quieter secondary paragraph. */
  aside?: string
  step: number
  total: number
  /** Present for `ack` steps; renders the primary Next / Got it button. */
  onAck?: () => void
  /** Present when the step offers an "I'll do it later" path. */
  onLater?: () => void
  /** Close control and Escape both call this; the host pauses. */
  onClose: () => void
  anchorRect: DOMRect | null
  isLast?: boolean
  /** Render in flow instead of portalling — for stories and the visual harness. */
  inline?: boolean
}

export function CoachBubble({
  title,
  body,
  aside,
  step,
  total,
  onAck,
  onLater,
  onClose,
  anchorRect,
  isLast = false,
  inline = false,
}: CoachBubbleProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<Placement>({ left: 0, top: 0, side: 'below' })

  useLayoutEffect(() => {
    if (inline || !isDesktop || !anchorRect || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    setPlacement(
      placeBubble(
        { top: anchorRect.top, left: anchorRect.left, width: anchorRect.width, height: anchorRect.height },
        { width: box.width || BUBBLE_WIDTH, height: box.height || FALLBACK_HEIGHT },
        { width: window.innerWidth, height: window.innerHeight },
        readSafeInsets(),
      ),
    )
  }, [anchorRect, body, inline, isDesktop, title])

  // Focus moves to the bubble when a step starts — unless the operator is typing.
  // Most steps advance *because* of what is being typed into the anchored field, so
  // a bare `ref.current.focus()` would pull the caret out of the input mid-word,
  // every keystroke. Anything editable keeps focus; the bubble's `aria-live` still
  // announces the new step.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null
    if (
      active &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable)
    ) {
      return
    }
    ref.current?.focus()
  }, [title, step])

  // Escape is only the tour's when focus is inside the tour. A dialog, a menu or a
  // combobox the operator opened owns its own Escape, and the bubble is on top of
  // the page, not in front of it.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!ref.current?.contains(document.activeElement)) return
      onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const sheet = !inline && !isDesktop

  const content = (
    <motion.div
      ref={ref}
      data-testid="tour-bubble"
      data-variant={inline ? 'inline' : isDesktop ? 'floating' : 'sheet'}
      role="dialog"
      aria-labelledby={titleId}
      aria-live="polite"
      tabIndex={-1}
      className={cn(
        'outline-none',
        inline && 'relative w-full max-w-sm',
        !inline && 'fixed z-[70]',
        !inline && isDesktop && 'w-80',
        sheet && 'left-0 right-0',
      )}
      style={
        inline
          ? undefined
          : isDesktop
            ? { left: placement.left, top: placement.top }
            : { bottom: 'calc(var(--safe-bottom) + 56px)' }
      }
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: 8 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
    >
      <OverlayPanel
        padding="md"
        shape={sheet ? 'sheet' : 'default'}
        className="max-h-[45dvh] overflow-y-auto md:max-h-[70dvh]"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t('tutorials.common.stepOf', { n: step, total })}</p>
            <h2 id={titleId} data-testid="tour-bubble-title" className="text-sm font-semibold text-foreground">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="tour-close"
            aria-label={t('tutorials.common.close')}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p data-testid="tour-bubble-body" className="mt-2 text-sm text-muted-foreground">
          {body}
        </p>
        {aside && (
          <p data-testid="tour-bubble-aside" className="mt-2 text-xs text-muted-foreground">
            {aside}
          </p>
        )}

        {(onLater || onAck) && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {onLater && (
              <Button variant="outline" size="sm" onClick={onLater} data-testid="tour-later" className="h-auto min-h-9 whitespace-normal">
                {t('tutorials.common.later')}
              </Button>
            )}
            {onAck && (
              <Button size="sm" onClick={onAck} data-testid="tour-next" className="h-auto min-h-9 whitespace-normal">
                {isLast ? t('tutorials.common.gotIt') : t('tutorials.common.next')}
              </Button>
            )}
          </div>
        )}
      </OverlayPanel>
    </motion.div>
  )

  if (inline || typeof document === 'undefined') return content
  return createPortal(content, document.body)
}
```

Create `web/src/components/tour/TourPill.tsx`:

```tsx
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface TourPillProps {
  step: number
  total: number
  /** Runs the step's `prepare` and un-pauses. */
  onResume: () => void
  /** Render in flow instead of portalling — for stories and the visual harness. */
  inline?: boolean
}

/**
 * The collapsed tour: shown while paused, or while the current anchor is off
 * screen or not rendered. Bottom centre, clear of the mobile tab bar.
 */
export function TourPill({ step, total, onResume, inline = false }: TourPillProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()

  const content = (
    <motion.div
      data-testid="tour-pill"
      className={cn(
        inline ? 'relative inline-block' : 'fixed left-1/2 z-[70] -translate-x-1/2',
      )}
      style={inline ? undefined : { bottom: 'calc(var(--safe-bottom) + 56px)' }}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: 8 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
    >
      <OverlayPanel padding="sm" shape="pill" className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t('tutorials.common.pillLabel', { n: step, total })}
        </span>
        <Button size="sm" variant="ghost" onClick={onResume} data-testid="tour-pill-resume" className="h-auto min-h-8">
          {t('tutorials.common.resume')}
        </Button>
      </OverlayPanel>
    </motion.div>
  )

  if (inline || typeof document === 'undefined') return content
  return createPortal(content, document.body)
}
```

Create `web/src/components/tour/Spotlight.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Spotlight } from './Spotlight'

const meta: Meta<typeof Spotlight> = { title: 'Tutorials/Spotlight', component: Spotlight }
export default meta
type Story = StoryObj<typeof Spotlight>

function rect(top: number, left: number, width: number, height: number): DOMRect {
  return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

export const OverAButton: Story = {
  render: function Render() {
    return (
      <div className="relative h-64">
        <button
          type="button"
          className="absolute left-10 top-10 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go live
        </button>
        <Spotlight rect={rect(60, 40, 120, 40)} />
      </div>
    )
  },
  parameters: {
    docs: { description: { story: 'The scrim covers the viewport and is never clickable; only the padded cut-out stays bright.' } },
  },
}

export const WideAnchor: Story = {
  render: () => <Spotlight rect={rect(200, 0, 900, 320)} />,
}
```

Create `web/src/components/tour/CoachBubble.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CoachBubble } from './CoachBubble'

const meta: Meta<typeof CoachBubble> = {
  title: 'Tutorials/CoachBubble',
  component: CoachBubble,
  args: {
    title: 'Place your first base',
    body: 'Tap the map where players should go, then choose Place base here.',
    step: 3,
    total: 12,
    anchorRect: null,
    inline: true,
    onClose: () => {},
  },
}
export default meta
type Story = StoryObj<typeof CoachBubble>

export const Default: Story = {}

export const WithAside: Story = {
  args: { aside: 'Bases can be moved later by dragging the marker.' },
}

export const AckStep: Story = {
  args: { onAck: () => {} },
}

export const FinalStep: Story = {
  args: { onAck: () => {}, isLast: true, title: 'That is a whole game', body: 'Your game is live and every mode is set up.' },
}

export const WithLaterAction: Story = {
  args: {
    onAck: () => {},
    onLater: () => {},
    title: 'Write the NFC tag',
    body: 'Hold a tag against the phone to link it to this base.',
    aside: 'Not now? The Tags tab lists every unlinked base and the readiness pill reminds you.',
  },
}

export const LongGermanCopy: Story = {
  args: {
    title: 'Platziere deine erste Basis auf der Karte',
    body: 'Tippe auf die Karte an der Stelle, an der die Teams später ankommen sollen, und wähle anschließend „Basis hier platzieren“, damit die Basis mit den Koordinaten dieses Punktes angelegt wird.',
    aside: 'Die Basis lässt sich später jederzeit verschieben, indem du die Markierung ziehst oder die Koordinaten direkt eingibst.',
    onAck: () => {},
    onLater: () => {},
  },
}
```

Create `web/src/components/tour/TourPill.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TourPill } from './TourPill'

const meta: Meta<typeof TourPill> = {
  title: 'Tutorials/TourPill',
  component: TourPill,
  args: { step: 4, total: 12, onResume: () => {}, inline: true },
}
export default meta
type Story = StoryObj<typeof TourPill>

export const Default: Story = {}
export const NearTheEnd: Story = { args: { step: 12, total: 12 } }
```

- [ ] **Step 5: Run test to verify it passes**

```
bun run --cwd web test -- src/components/tour
bun run --cwd web typecheck
bun run --cwd web lint
```

Expected: 4 Spotlight tests, 10 CoachBubble tests and 2 TourPill tests pass.

- [ ] **Step 6: Stage**

```bash
git add web/src/components/tour design-system/tokens.json \
  web/src/generated/design-tokens.css web/src/generated/designTokens.ts web/src/generated/colorValues.ts \
  ios-app/dbv-nfc-games/App/Theme/GeneratedDesignTokens.swift \
  ios-app/dbv-nfc-games/App/Theme/GeneratedColorValues.swift \
  android-app/core/designsystem/src/main/kotlin/com/prayer/pointfinder/core/designsystem/GeneratedDesignTokens.kt \
  android-app/core/designsystem/src/main/kotlin/com/prayer/pointfinder/core/designsystem/GeneratedColorValues.kt
git status --short
```

Expected: only those paths. If `make design-system-generate` rewrote a generated file with
identical content, git shows nothing for it — that is correct, not a missed step.

---

### Task 10: `useTourState`, `useTourActions`, `TourHost` and the App mount

**Files:**
- Create `web/src/features/tutorials/useTourState.ts`
- Create `web/src/features/tutorials/useTourActions.ts`
- Create `web/src/features/tutorials/TourHost.tsx`
- Modify `web/src/App.tsx` (root route element and the module-level mutation-log subscription)
- Test: create `web/src/features/tutorials/TourHost.test.tsx`

**Interfaces:**
- Produces `useTourState(): TourState`, `useTourActions(): TourActions`, `TourHost()`, `INPUT_SETTLE_MS`.
- Consumes `effectiveSteps`, `advance`, `stepIndexOf`, `resolveAnchor`, `resolveBody`, `useTourStore`, `getScenario`, `useAnchorRect`, `Spotlight`, `CoachBubble`, `TourPill`, `useReadinessChecks`, the workspace store and `isNative`.

> Three rules the runner implements, each of which the naive version gets wrong:
>
> - **Position comes from `currentStepId`, resolved through `advance` on every render.**
>   Never from a stored index. The store's id may name a step whose `when` just turned
>   false; `advance` is what copes with that.
> - **Typing is debounced.** `click` and `change` bump `tick` on the next animation frame;
>   `input` bumps `INPUT_SETTLE_MS = 500` ms after the last keystroke. Without this the host
>   re-renders on every character and a "name is not the prefilled default" predicate fires
>   on a half-typed word, so the coach mark vanishes mid-sentence.
> - **`Step.route` is honoured on resume.** A run paused on the workspace can be resumed
>   from the dashboard, where the anchor does not exist and `prepare` has nothing to reveal.
>   Resume navigates first, then prepares.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/TourHost.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { INPUT_SETTLE_MS, TourHost } from './TourHost'
import { useTourStore } from './store'
import { SCENARIOS, registerScenario } from './scenarios'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAuthStore } from '@/lib/auth/store'
import type { Scenario } from './types'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const prepare = vi.fn()

const probe: Scenario = {
  id: 'first-game',
  entry: 'setup-game',
  title: 'tutorials.scenarios.firstGame.title',
  blurb: 'tutorials.scenarios.firstGame.blurb',
  steps: [
    {
      id: 'type-a-name',
      anchor: 'probe-name',
      done: { kind: 'predicate', test: (s) => s.field('probe-name').value.length > 0 },
      copy: { title: 'tutorials.common.next', body: 'tutorials.common.gotIt' },
    },
    {
      id: 'read-this',
      anchor: 'probe-missing',
      route: 'workspace',
      prepare,
      done: { kind: 'ack' },
      copy: { title: 'tutorials.common.resume', body: 'tutorials.common.close' },
    },
  ],
}

/** Reports the router's current path so the route-on-resume rule can be asserted. */
function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>
}

function Harness({ children, path }: { children: ReactNode; path: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderHost(path = '/game/game-1') {
  return render(
    <Harness path={path}>
      <input data-testid="probe-name" defaultValue="" />
      <TourHost />
    </Harness>,
  )
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  prepare.mockClear()
  useTourStore.getState().reset()
  useWorkspaceStore.getState().reset()
  useAuthStore.setState({
    user: { id: 'u1', email: 'op@example.com', name: 'Op', role: 'operator', createdAt: '2026-01-01T00:00:00Z' },
    isAuthenticated: true,
  } as never)
  registerScenario(probe)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete SCENARIOS['first-game']
})

describe('TourHost', () => {
  it('renders nothing until a scenario is running', () => {
    renderHost()
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tour-pill')).not.toBeInTheDocument()
  })

  it('records its position as a step id on the first render', async () => {
    renderHost()
    useTourStore.getState().start('first-game', { gameId: 'game-1' })

    // The store starts with `currentStepId: null`; the host is the only place that
    // knows the effective list, so it writes a real id straight away — which is what
    // phase 3's write-through sends to the server.
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('type-a-name'))
  })

  it('shows the bubble on the first step and advances when the predicate turns true', async () => {
    const user = userEvent.setup()
    renderHost()
    useTourStore.getState().start('first-game', { gameId: 'game-1' })

    expect(await screen.findByTestId('tour-bubble-title')).toHaveTextContent('Next')

    await user.type(screen.getByTestId('probe-name'), 'Old mill')

    // Typing is debounced by INPUT_SETTLE_MS, so give it more than the 1 s default.
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('read-this'), {
      timeout: 3_000,
    })
    await waitFor(() => expect(useTourStore.getState().stepCompletedAt['type-a-name']).toBeGreaterThan(0))
  })

  it('does not advance until the operator stops typing', () => {
    vi.useFakeTimers()
    try {
      renderHost()
      act(() => {
        useTourStore.getState().start('first-game', { gameId: 'game-1' })
      })

      const input = screen.getByTestId('probe-name') as HTMLInputElement
      // Three keystrokes, each less than the settle window apart.
      for (const value of ['O', 'Ol', 'Old']) {
        act(() => {
          input.value = value
          input.dispatchEvent(new Event('input', { bubbles: true }))
          vi.advanceTimersByTime(INPUT_SETTLE_MS - 100)
        })
        expect(useTourStore.getState().currentStepId).toBe('type-a-name')
      }

      act(() => {
        vi.advanceTimersByTime(INPUT_SETTLE_MS)
      })
      expect(useTourStore.getState().currentStepId).toBe('read-this')
    } finally {
      vi.useRealTimers()
    }
  })

  it('collapses to the pill when the step anchor is not in the DOM', async () => {
    renderHost()
    useTourStore.getState().start('first-game', { gameId: 'game-1' })
    useTourStore.getState().setCurrentStep('read-this')

    expect(await screen.findByTestId('tour-pill')).toHaveTextContent('step 2 of 2')
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
  })

  it('runs prepare when the step starts and again when the pill resumes', async () => {
    const user = userEvent.setup()
    renderHost()
    useTourStore.getState().start('first-game', { gameId: 'game-1' })
    useTourStore.getState().setCurrentStep('read-this')

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1))

    useTourStore.getState().pause()
    await user.click(await screen.findByTestId('tour-pill-resume'))

    expect(useTourStore.getState().paused).toBe(false)
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('navigates back to the step route before resuming', async () => {
    const user = userEvent.setup()
    // Paused on a `route: 'workspace'` step, but the operator wandered to the dashboard.
    renderHost('/dashboard')
    useTourStore.getState().start('first-game', { gameId: 'game-1' })
    useTourStore.getState().setCurrentStep('read-this')
    useTourStore.getState().pause()

    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    await user.click(await screen.findByTestId('tour-pill-resume'))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/game/game-1'))
    expect(prepare).toHaveBeenCalled()
  })

  it('pauses when the bubble is closed and shows the pill instead', async () => {
    const user = userEvent.setup()
    renderHost()
    useTourStore.getState().start('first-game', { gameId: 'game-1' })

    await user.click(await screen.findByTestId('tour-close'))

    expect(useTourStore.getState().paused).toBe(true)
    expect(await screen.findByTestId('tour-pill')).toBeInTheDocument()
  })

  it('binds the route game when the scenario has none yet', async () => {
    renderHost()
    useTourStore.getState().start('first-game')

    await waitFor(() => expect(useTourStore.getState().gameId).toBe('game-1'))
  })
})
```

> jsdom gives every element a zero rect, so `isAnchorVisible` would call the probe input invisible and collapse to the pill. Give the probe a real rect in the test by stubbing `HTMLElement.prototype.getBoundingClientRect` in `beforeEach`:
>
> ```ts
> vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
>   top: 10, left: 10, right: 210, bottom: 50, width: 200, height: 40, x: 10, y: 10, toJSON: () => ({}),
> } as DOMRect)
> ```
>
> and `vi.restoreAllMocks()` in `afterEach`. `anchorElement('probe-missing')` still returns `null`, so the pill test is unaffected.

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/tutorials/TourHost.test.tsx
```

Expected: FAIL — `Failed to resolve import "./TourHost"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/features/tutorials/useTourActions.ts`:

```ts
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '@/stores/workspace'
import type { TourActions } from './types'

/**
 * The only automation a step is allowed: reveal an anchor. Nothing here creates
 * an entity or changes game status — a tutorial prepares, it never performs.
 */
export function useTourActions(): TourActions {
  const navigate = useNavigate()
  const setMode = useWorkspaceStore((s) => s.setMode)
  const openDrawer = useWorkspaceStore((s) => s.openDrawer)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const selectChallenge = useWorkspaceStore((s) => s.selectChallenge)
  const selectTeam = useWorkspaceStore((s) => s.selectTeam)
  const setReadinessExpanded = useWorkspaceStore((s) => s.setReadinessExpanded)
  const setSettingsPanelOpen = useWorkspaceStore((s) => s.setSettingsPanelOpen)

  return useMemo<TourActions>(
    () => ({
      setMode,
      openDrawer: (tab) => openDrawer(tab),
      selectBase,
      selectChallenge,
      selectTeam,
      setReadinessExpanded,
      setSettingsPanelOpen,
      navigate: (to) => navigate(to),
    }),
    [navigate, openDrawer, selectBase, selectChallenge, selectTeam, setMode, setReadinessExpanded, setSettingsPanelOpen],
  )
}
```

Create `web/src/features/tutorials/useTourState.ts`:

```ts
import { useLocation, useMatch } from 'react-router-dom'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useGame, useGames } from '@/hooks/queries/useGames'
import { useTeams } from '@/hooks/queries/useTeams'
import { useReadinessChecks } from '@/features/build/ReadinessIndicator'
import { useWorkspaceStore } from '@/stores/workspace'
import { isNative } from '@/platform/runtime'
import { useTourStore } from './store'
import { readAnchorField, pressedIn } from './dom'
import type { TourState } from './types'

/**
 * One snapshot of everything a step predicate may look at. Called only from
 * inside a running tour, so the extra queries never fire for an operator who is
 * not in a tutorial.
 */
export function useTourState(): TourState {
  const location = useLocation()
  const gameRoute = useMatch('/game/:id')
  const routeGameId = gameRoute?.params.id ?? null

  const scenarioId = useTourStore((s) => s.activeScenario)
  const boundGameId = useTourStore((s) => s.gameId)
  const startedAt = useTourStore((s) => s.startedAt)
  const ackedSteps = useTourStore((s) => s.ackedSteps)
  const laterSteps = useTourStore((s) => s.laterSteps)
  const stepCompletedAt = useTourStore((s) => s.stepCompletedAt)
  const lastSuccess = useTourStore((s) => s.lastSuccess)
  // Subscribing to `tick` is what makes DOM-reading predicates re-evaluate.
  useTourStore((s) => s.tick)

  const gameId = boundGameId ?? null
  const queryGameId = gameId ?? undefined

  const { data: games } = useGames()
  const { data: game } = useGame(queryGameId)
  const { data: bases } = useBases(queryGameId)
  const { data: challenges } = useChallenges(queryGameId)
  const { data: teams } = useTeams(queryGameId)
  const { data: assignments } = useAssignments(queryGameId)
  const readiness = useReadinessChecks(gameId ?? '')

  const mode = useWorkspaceStore((s) => s.mode)
  const drawerOpen = useWorkspaceStore((s) => s.drawerOpen)
  const drawerTab = useWorkspaceStore((s) => s.drawerTab)
  const selectedBaseId = useWorkspaceStore((s) => s.selectedBaseId)
  const selectedChallengeId = useWorkspaceStore((s) => s.selectedChallengeId)
  const selectedTeamId = useWorkspaceStore((s) => s.selectedTeamId)
  const readinessExpanded = useWorkspaceStore((s) => s.readinessExpanded)
  const settingsPanelOpen = useWorkspaceStore((s) => s.settingsPanelOpen)

  return {
    now: Date.now(),
    startedAt,
    scenarioId,
    gameId,
    routeGameId,
    isDashboard: location.pathname === '/dashboard',
    isNative: isNative(),
    games: games ?? [],
    game: game ?? null,
    bases: bases ?? [],
    challenges: challenges ?? [],
    teams: teams ?? [],
    assignments: assignments ?? [],
    readiness: {
      allPassed: readiness.allPassed,
      failing: readiness.checks.filter((check) => !check.passed).map((check) => check.label),
    },
    mode,
    drawerOpen,
    drawerTab,
    selectedBaseId,
    selectedChallengeId,
    selectedTeamId,
    readinessExpanded,
    settingsPanelOpen,
    lastSuccess,
    stepCompletedAt,
    ackedSteps,
    laterSteps,
    field: readAnchorField,
    pressedIn,
  }
}
```

Create `web/src/features/tutorials/TourHost.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CoachBubble } from '@/components/tour/CoachBubble'
import { Spotlight } from '@/components/tour/Spotlight'
import { TourPill } from '@/components/tour/TourPill'
import { useAnchorRect } from '@/components/tour/useAnchorRect'
import { useAuthStore } from '@/lib/auth/store'
import { advance, effectiveSteps, resolveAnchor, resolveBody, stepIndexOf } from './engine'
import { getScenario } from './scenarios'
import { useTourStore } from './store'
import { useTourActions } from './useTourActions'
import { useTourState } from './useTourState'
import type { Scenario, TourActions, TourState } from './types'

/**
 * How long the operator has to stop typing before the engine re-reads the DOM.
 * Every keystroke re-rendering the host is both wasteful and wrong: a predicate
 * like "the name is no longer the prefilled default" would fire on a half-typed
 * word and the coach mark would disappear mid-sentence.
 */
export const INPUT_SETTLE_MS = 500

/**
 * Mounted once in the pathless root route so it has router context everywhere.
 * It renders — and mounts query hooks — only while a scenario is actually
 * running for an operator, so it costs nothing on every other route.
 */
export function TourHost() {
  const activeScenario = useTourStore((s) => s.activeScenario)
  const role = useAuthStore((s) => s.user?.role)
  const scenario = activeScenario ? getScenario(activeScenario) : undefined

  if (!scenario) return null
  if (role !== 'operator' && role !== 'admin') return null
  return <TourRunner scenario={scenario} />
}

function TourRunner({ scenario }: { scenario: Scenario }) {
  const { t } = useTranslation()
  const state = useTourState()
  const actions = useTourActions()

  const currentStepId = useTourStore((s) => s.currentStepId)
  const paused = useTourStore((s) => s.paused)
  const gameId = useTourStore((s) => s.gameId)
  const clickedSteps = useTourStore((s) => s.clickedSteps)
  const tick = useTourStore((s) => s.tick)
  const ack = useTourStore((s) => s.ack)
  const later = useTourStore((s) => s.later)
  const clicked = useTourStore((s) => s.clicked)
  const pause = useTourStore((s) => s.pause)
  const resume = useTourStore((s) => s.resume)
  const bindGame = useTourStore((s) => s.bindGame)
  const bumpTick = useTourStore((s) => s.bumpTick)
  const setCurrentStep = useTourStore((s) => s.setCurrentStep)
  const markStepCompleted = useTourStore((s) => s.markStepCompleted)
  const complete = useTourStore((s) => s.complete)

  const steps = effectiveSteps(scenario, state)
  // The engine owns the position. `currentStepId` is where the run was; `advance`
  // turns that into where it is now — skipping predicate steps that already pass and
  // coping with a step whose `when` guard just turned false. Null means finished.
  const activeStepId = advance(scenario, state, clickedSteps, currentStepId)
  const index = stepIndexOf(scenario, state, activeStepId)
  const step = index >= 0 ? steps[index] : undefined
  const anchorId = step ? resolveAnchor(step, state) : null
  const { element, rect, visible } = useAnchorRect(anchorId, tick)

  // Latest state/actions without making them effect dependencies.
  const latest = useRef<{ state: TourState; actions: TourActions }>({ state, actions })
  latest.current = { state, actions }

  // A `new-game` scenario follows the operator into the workspace of the game
  // they just created; a `setup-game` scenario is already bound at start.
  useEffect(() => {
    if (!gameId && state.routeGameId) bindGame(state.routeGameId)
  }, [bindGame, gameId, state.routeGameId])

  // Capture-phase listeners: record clicks inside the anchor, and nudge the engine
  // whenever anything in the app is typed or pressed, so predicates that read
  // unsaved form fields stay live. A click or a committed `change` is a decision
  // and lands on the next frame; typing is not, and waits for a pause.
  useEffect(() => {
    let frame = 0
    let inputTimer: ReturnType<typeof setTimeout> | null = null

    const nudgeNow = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        bumpTick()
      })
    }
    const nudgeAfterTyping = () => {
      if (inputTimer) clearTimeout(inputTimer)
      inputTimer = setTimeout(() => {
        inputTimer = null
        bumpTick()
      }, INPUT_SETTLE_MS)
    }
    const onClick = (event: Event) => {
      const target = event.target
      if (step && element && target instanceof Node && element.contains(target)) clicked(step.id)
      nudgeNow()
    }

    document.addEventListener('click', onClick, true)
    document.addEventListener('input', nudgeAfterTyping, true)
    document.addEventListener('change', nudgeNow, true)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      if (inputTimer) clearTimeout(inputTimer)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('input', nudgeAfterTyping, true)
      document.removeEventListener('change', nudgeNow, true)
    }
  }, [bumpTick, clicked, element, step])

  // Write the engine's answer back to the store, recording the step we left behind
  // on the way past. `advance` returning null means the scenario is over: `complete()`
  // records the row and clears the run in one action, so nothing else has to build a
  // `TutorialProgress` by hand.
  useEffect(() => {
    if (steps.length === 0) return
    if (activeStepId === currentStepId) return
    if (currentStepId && steps.some((candidate) => candidate.id === currentStepId)) {
      markStepCompleted(currentStepId, Date.now())
    }
    if (activeStepId === null) {
      complete()
      return
    }
    setCurrentStep(activeStepId)
  }, [activeStepId, complete, currentStepId, markStepCompleted, setCurrentStep, steps])

  // `prepare` reveals the anchor when the step starts. Idempotent per step id.
  const preparedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!step || paused) return
    if (preparedFor.current === step.id) return
    preparedFor.current = step.id
    step.prepare?.(latest.current.actions, latest.current.state)
  }, [paused, step])

  if (!step) return null

  const total = steps.length
  const handleClose = () => {
    pause()
    element?.focus?.()
  }
  // A paused run is resumed from wherever the operator ended up, which may be a
  // route where the step's anchor does not exist and `prepare` has nothing to
  // reveal. Get back to the right screen first, then reveal, then un-pause.
  const handleResume = () => {
    const { actions, state: snapshot } = latest.current
    if (step.route === 'workspace' && gameId && snapshot.routeGameId !== gameId) {
      actions.navigate(`/game/${gameId}`)
    } else if (step.route === 'dashboard' && !snapshot.isDashboard) {
      actions.navigate('/dashboard')
    }
    step.prepare?.(actions, snapshot)
    resume()
  }

  if (paused || !visible || !rect) {
    return <TourPill step={index + 1} total={total} onResume={handleResume} />
  }

  return (
    <>
      <Spotlight rect={rect} />
      <CoachBubble
        title={t(step.copy.title)}
        body={t(resolveBody(step, state))}
        aside={step.copy.aside ? t(step.copy.aside) : undefined}
        step={index + 1}
        total={total}
        anchorRect={rect}
        isLast={index === total - 1}
        onAck={step.done.kind === 'ack' ? () => ack(step.id) : undefined}
        onLater={step.copy.later ? () => later(step.id) : undefined}
        onClose={handleClose}
      />
    </>
  )
}
```

In `web/src/App.tsx`, add the imports next to the other feature imports at the top:

```ts
import { TourHost } from '@/features/tutorials/TourHost';
import { subscribeMutationLog } from '@/features/tutorials/mutationLog';
import { useTourStore } from '@/features/tutorials/store';
```

Immediately after the `useAuthStore.subscribe(...)` block that clears the query cache on logout, add the mutation-log wiring against the same module-level client:

```ts
// Successful mutations feed the tutorial engine, so a step can say "the base
// save succeeded after this step started". Lives for the life of the module.
subscribeMutationLog(queryClient, (key, at) => useTourStore.getState().recordSuccess(key, at));
```

and mount the host in the pathless root route element:

```tsx
const router = createBrowserRouter([{ errorElement: <AppErrorFallback />, element: <><PushIntake /><TagIntake /><TourHost /></>, children: [
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/tutorials/TourHost.test.tsx
bun run --cwd web test -- src/features/tutorials
bun run --cwd web typecheck
bun run --cwd web lint
```

Expected: the 9 host tests plus every earlier tutorials test pass.

- [ ] **Step 5: Stage**

```bash
git add web/src/features/tutorials/useTourState.ts web/src/features/tutorials/useTourActions.ts web/src/features/tutorials/TourHost.tsx web/src/features/tutorials/TourHost.test.tsx web/src/App.tsx
```

---

### Task 11: Visual harness section and visual-system documentation

**Files:**
- Modify `web/src/features/dev/VisualHarnessPage.tsx` (imports at the top; one `HarnessSection` after the "Check-in methods, claims and printable codes" section, which ends around line 226)
- Modify `docs/visual-system/tokens.md` (new "Layering" section after "Elevation And Blur")
- Modify `docs/visual-system/component-inventory.md` (append a dated group)
- Modify `docs/visual-system/patterns.md` (append a "Guided Tutorial" section)
- Modify `docs/visual-system/preview-matrix.md` (one new row)
- Test: create `web/src/features/dev/VisualHarnessPage.tutorials.test.tsx`

**Interfaces:**
- Consumes `CoachBubble`, `TourPill` with `inline`.
- Produces the harness scenario id `harness-tutorials`.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/dev/VisualHarnessPage.tutorials.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VisualHarnessPage } from './VisualHarnessPage'

vi.mock('@/components/map/LocationPicker', () => ({
  LocationPicker: () => <div data-testid="location-picker-mock" />,
}))

describe('VisualHarnessPage tutorial scenario', () => {
  it('previews the coach bubble states and the collapsed pill', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VisualHarnessPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const section = screen.getByTestId('harness-tutorials')
    expect(section).toHaveTextContent('Place your first base')
    expect(section).toHaveTextContent('Basis hier platzieren')
    expect(section).toHaveTextContent('Players never see scores.')
    expect(section).toHaveTextContent("I'll do it later")
    expect(section).toHaveTextContent('Tutorial · step 4 of 12')
    expect(section.querySelectorAll('[data-testid="tour-bubble"]')).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run --cwd web test -- src/features/dev/VisualHarnessPage.tutorials.test.tsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="harness-tutorials"]`.

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/dev/VisualHarnessPage.tsx`, extend the imports (after the existing `import { CHECK_IN_METHODS } from '@/types/checkIn'` group):

```tsx
import { CoachBubble } from '@/components/tour/CoachBubble'
import { TourPill } from '@/components/tour/TourPill'
```

and add this `HarnessSection` immediately after the closing `</HarnessSection>` of the `title="Check-in methods, claims and printable codes"` block:

```tsx
          <HarnessSection title="Guided tutorial coach marks">
            <div className="flex flex-col items-start gap-3" data-testid="harness-tutorials">
              <CoachBubble
                inline
                anchorRect={null}
                step={3}
                total={12}
                title="Place your first base"
                body="Tap the map where players should go, then choose Place base here."
                onClose={() => {}}
              />
              <CoachBubble
                inline
                anchorRect={null}
                step={6}
                total={12}
                title="Points"
                body="Scoring weight for this challenge."
                aside="Players never see scores."
                onAck={() => {}}
                onClose={() => {}}
              />
              <CoachBubble
                inline
                anchorRect={null}
                step={7}
                total={12}
                title="Write the NFC tag"
                body="Hold a tag against the phone to link it to this base."
                aside="Not now? The Tags tab lists every unlinked base and the readiness pill reminds you."
                onAck={() => {}}
                onLater={() => {}}
                onClose={() => {}}
              />
              <CoachBubble
                inline
                anchorRect={null}
                step={3}
                total={12}
                title="Platziere deine erste Basis auf der Karte"
                body="Tippe auf die Karte an der Stelle, an der die Teams später ankommen sollen, und wähle anschließend „Basis hier platzieren“, damit die Basis mit den Koordinaten dieses Punktes angelegt wird."
                aside="Die Basis lässt sich später jederzeit verschieben, indem du die Markierung ziehst oder die Koordinaten direkt eingibst."
                onAck={() => {}}
                onLater={() => {}}
                onClose={() => {}}
              />
              <TourPill inline step={4} total={12} onResume={() => {}} />
            </div>
          </HarnessSection>
```

In `docs/visual-system/tokens.md`, add the new token to the "Surfaces" table — one row after
`color.surface.scrim`:

```markdown
| `color.surface.tourScrim` | Guided-tutorial scrim |
```

and, immediately below that table's existing paragraph ("Authenticated product UI should not
invent one-off panel colors…"), add:

```markdown
The tutorial scrim is deliberately lighter than the modal scrim — 30 % in light,
50 % in dark against the modal's 60 % and 70 %. A modal scrim says "deal with me
first"; a tutorial scrim says "look here, but carry on". The tour never intercepts
a click, so dimming the screen as hard as a dialog would misdescribe what it does.
Do not reuse `surface.scrim` for the spotlight, and do not reuse `surface.tourScrim`
for anything that actually blocks.
```

Then add a new section, immediately after the "Elevation And Blur" section's blur rules and
before "## Icons":

```markdown
## Layering

One ladder, shared by every operator surface. Do not invent an intermediate
value; pick the rung that matches the meaning.

| Layer | Class | What sits here |
|---|---|---|
| 30 | `z-30` | Floating map bars and workspace controls |
| 40 | `z-40` | Desktop icon rail |
| 50 | `z-50` | Drawers, dialogs, the mobile tab bar |
| 60 | `z-[60]` | Portalled menus that must escape a scrolling rail |
| 70 | `z-[70]` | Tutorial layer: spotlight, coach bubble, collapsed pill |
| 100 | `z-[100]` | Toasts |

The tutorial layer is above the drawer and portalled menus because it teaches
the operator how to use them, and below toasts because a save confirmation must
never be hidden by a coach mark. Everything on the tutorial layer that is not a
control is `pointer-events-none`.
```

Append to `docs/visual-system/component-inventory.md`:

```markdown
## Guided tutorials (2026-09-06)

Component: Spotlight
Status: canonical
Location: `web/src/components/tour/Spotlight.tsx`
Modes: Operator Setup, Operator Command
States: no anchor (renders nothing), small control anchor, full-width map anchor,
reduced motion (no fade)
Notes: A body-level portal on the `z-[70]` tutorial layer holding one SVG whose
mask is the viewport minus a rounded rectangle over the anchor rect, padded 8 px.
Fills with `var(--pf-color-surface-tourScrim)` — lighter than the modal scrim,
because the tour invites the operator to keep using the screen — so light and dark
both dim correctly.
`pointer-events-none` end to end — the tour dims, it never blocks, and the
operator can wander off at any moment. Test ids `tour-spotlight` and
`tour-spotlight-hole`. Preview: Storybook `Tutorials/Spotlight`.
See `docs/specs/2026-09-06-operator-tutorials-design.md`.

Component: CoachBubble
Status: canonical
Location: `web/src/components/tour/CoachBubble.tsx`, `web/src/components/tour/placement.ts`
Modes: Operator Setup, Operator Command
States: default (no buttons — the step completes by doing the thing), ack step
with Next, final step with Got it, with aside, with "I'll do it later", long
German copy, desktop floating (right / left / below collision flipping), mobile
bottom sheet, reduced motion, inline (stories and harness)
Notes: Built on `OverlayPanel` so the blur comes from the canonical surface
rather than a feature file. `role="dialog"`, `aria-live="polite"`, labelled by
its own title, focused when a step starts; Escape and the close control both
pause. Placement is the pure `placeBubble` helper — right, else left, else below,
always clamped to the `--safe-*` insets exactly like the floating menu in
`components/ui/dropdown-menu.tsx`. Below `md` it becomes a bottom sheet reserving
the 56 px mobile tab bar, capped at 45dvh with internal scroll so German copy
scrolls instead of clipping. Test ids `tour-bubble`, `tour-bubble-title`,
`tour-bubble-body`, `tour-bubble-aside`, `tour-next`, `tour-later`, `tour-close`.
Preview: Storybook `Tutorials/CoachBubble` and `/dev/visual-system`.

Component: TourPill
Status: canonical
Location: `web/src/components/tour/TourPill.tsx`
Modes: Operator Setup, Operator Command
States: mid-scenario, last step, paused, inline
Notes: The collapsed tour. Shown when the operator paused, or when the current
anchor is not rendered or is fully off screen, so a tutorial never points at
nothing. Bottom centre, clear of the mobile tab bar, on the `z-[70]` layer.
Resuming re-runs the step's `prepare`, which is what brings the anchor back.
Test ids `tour-pill`, `tour-pill-resume`. Preview: Storybook `Tutorials/TourPill`
and `/dev/visual-system`.
```

Append to `docs/visual-system/patterns.md`:

```markdown
## Guided Tutorial

Tutorials teach by doing, on the operator's own game, not in a sandbox. A
scenario is an ordered list of steps; each step spotlights one existing element
by its `data-testid` and explains what it does and what else the screen offers.

Non-blocking is the rule. The scrim dims, it never intercepts a click, and the
operator can ignore the bubble, wander to another mode, and come back. Steps
advance when real state changes — a base exists, a field has a value, a mutation
succeeded — not because someone pressed Next. Next exists only for steps that are
pure explanation. A step that is already satisfied is skipped rather than asked
for again; an explanation the operator has not read is never skipped.

Prepare, do not perform. A step may reveal its anchor — switch mode, open a
drawer tab, expand the readiness panel, open settings, select an entity — and
nothing else. It never creates a base, links a tag, saves a form, or changes game
status. The operator performs every domain action themselves, which is the whole
point of teaching on a real game.

Never point at nothing. If the anchor is not rendered or is entirely off screen,
the bubble collapses to the pill; resuming from the pill re-runs the step's
prepare to bring the anchor back.

On phones the bubble is a bottom sheet above the 56 px tab bar, capped in height
with internal scroll, so the longest German step copy scrolls instead of clipping
its buttons; on desktop it floats beside the anchor and flips against the
viewport and the safe-area insets. Both live on the `z-[70]` tutorial layer:
above drawers and menus, below toasts.
```

Add one row to the table in `docs/visual-system/preview-matrix.md`, after the `Operator readiness rows per check-in method` row:

```markdown
| Guided tutorial coach bubble, spotlight and collapsed pill | yes | n/a | n/a |
```

and extend the trailing paragraph with one sentence:

```markdown
Guided tutorials are marked `n/a` for the legacy Swift and Compose apps: the operator tutorial engine ships once in `web/` for the browser and the Tauri shell, and the maintenance-footing native operator apps do not receive it.
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run --cwd web test -- src/features/dev/VisualHarnessPage.tutorials.test.tsx
bun run --cwd web test -- src/features/dev
```

Expected: the new test passes and `VisualHarnessPage.checkin.test.tsx` still passes.

- [ ] **Step 5: Stage**

```bash
git add web/src/features/dev/VisualHarnessPage.tsx web/src/features/dev/VisualHarnessPage.tutorials.test.tsx docs/visual-system/tokens.md docs/visual-system/component-inventory.md docs/visual-system/patterns.md docs/visual-system/preview-matrix.md
```

---

### Task 12: Verify and commit

**Files:** none new — this task runs the phase gate and produces the phase's ONE commit.

**Interfaces:** none.

- [ ] **Step 1: Run the full phase gate and read every output**

```
bun run --cwd web typecheck
bun run --cwd web lint
bun run --cwd web test
bun run --cwd packages/i18n test
make design-system-check
make design-system-audit
bun run --cwd web build-storybook
```

Expected:
- `typecheck`: no output, exit 0.
- `lint`: no errors. Warnings that already existed on `master` are acceptable; new ones are not.
- `web test`: the whole suite green, including the eleven new files (`dom`, `engine`, `store`, `mutationLog`, `mutationKeys`, `placement`, `useAnchorRect`, `Spotlight`, `CoachBubble`, `TourPill`, `TourHost`, `IconRail.anchors`, `VisualHarnessPage.tutorials`) and every pre-existing test.
- `packages/i18n test`: green, including the new tutorial chrome contract.
- `design-system-check`: `validated <n> token leaves, …` and **no** `stale:` line. This phase does change a token source (`color.surface.tourScrim`, Task 9 Step 1), so this only passes if `make design-system-generate` was run and all seven regenerated adapters are staged. A `stale: web/src/generated/design-tokens.css` line means the regeneration was skipped or a generated file was hand-edited — re-run the generator, never patch the output.
- `design-system-audit`: advisory. `raw colors`, `raw Tailwind palettes` and `unapproved web icon packages` must not grow. `direct screen styling` (which greps `web/src/features` for `backdrop-blur`, `rounded-2xl|3xl`, `shadow-xl|2xl`) must not grow either — the tour components live under `web/src/components`, so they are outside that path by design. `duplicate component filenames` must not grow: `Spotlight.tsx`, `CoachBubble.tsx`, `TourPill.tsx`, `useAnchorRect.ts` and `placement.ts` are unique in `web/src/components`.
- `build-storybook`: builds `storybook-static/` with no errors; the three new `Tutorials/*` story files compile.

If anything fails, fix it and re-run the whole gate before continuing. Never claim a pass you did not read.

- [ ] **Step 2: Confirm nothing off-limits is staged**

```
git status --short
```

Expected: every listed path is under `web/src`, `packages/i18n/src`, `e2e/shared/`, `docs/visual-system/`, `design-system/tokens.json`, or the regenerated adapters under `ios-app/…/App/Theme/` and `android-app/core/designsystem/…`. `docs/specs/2026-09-06-operator-tutorials-design.md` and everything under `docs/superpowers/plans/` must still show as untracked (`??`) and must NOT be staged. If `storybook-static/` appears, do not stage it (confirm it is git-ignored; if it is not, leave it unstaged).

- [ ] **Step 3: Stage anything a task missed**

```bash
git add web/src/features/tutorials web/src/components/tour \
  web/src/components/layout/IconRail.tsx web/src/components/layout/IconRail.anchors.test.tsx \
  web/src/components/feedback/EmptyState.tsx web/src/components/ui/switch.tsx \
  web/src/features/dashboard/DashboardPage.tsx \
  web/src/features/build/BasesTab.tsx web/src/features/build/GameSettingsPanel.tsx \
  web/src/features/build/ChallengeDetail.tsx web/src/features/build/ChallengeDetail.test.tsx \
  web/src/features/build/ReadinessIndicator.tsx \
  web/src/features/build/ReadinessIndicator.test.tsx \
  web/src/features/dev/VisualHarnessPage.tsx web/src/features/dev/VisualHarnessPage.tutorials.test.tsx \
  web/src/stores/workspace.ts web/src/stores/workspace.test.ts \
  web/src/hooks/mutations/useBaseMutations.ts web/src/hooks/mutations/useChallengeMutations.ts \
  web/src/hooks/mutations/useAssignmentMutations.ts web/src/hooks/mutations/useGameMutations.ts \
  web/src/hooks/mutations/mutationKeys.test.ts web/src/App.tsx \
  packages/i18n/src/locales/en.json packages/i18n/src/locales/pt.json packages/i18n/src/locales/de.json \
  packages/i18n/src/locales.test.ts e2e/shared/web-helpers.ts \
  design-system/tokens.json web/src/generated \
  ios-app/dbv-nfc-games/App/Theme/GeneratedDesignTokens.swift \
  ios-app/dbv-nfc-games/App/Theme/GeneratedColorValues.swift \
  android-app/core/designsystem/src/main/kotlin/com/prayer/pointfinder/core/designsystem \
  docs/visual-system/tokens.md docs/visual-system/component-inventory.md \
  docs/visual-system/patterns.md docs/visual-system/preview-matrix.md
git status --short
```

- [ ] **Step 4: Commit — the phase's ONE atomic commit**

```bash
git commit -m "feat(web): tutorial engine, spotlight and coach bubble" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Confirm the commit**

```
git show --stat HEAD
git log --oneline -3
```

Expected: one commit whose stat lists only the paths above, whose parent is the previous `master` head, and no file under `docs/specs/` or `docs/superpowers/`.

---

## Self-review

### 1. Spec coverage for phase 1

Everything the spec's build order item 1 names, mapped to a task:

| Spec / index requirement | Task |
|---|---|
| `features/tutorials/types.ts` — every contract type | 1 |
| `features/tutorials/dom.ts` — `readAnchorField`, `pressedIn`, `anchorElement`, `isAnchorVisible` | 1 |
| `features/tutorials/anchors.ts` — `KNOWN_ANCHORS` + prefixes | 1 |
| `features/tutorials/engine.ts` — `effectiveSteps`, `isStepDone`, `advance`, `stepIndexOf`, `resolveAnchor`, `resolveBody` | 2 |
| Engine rule 1 (`when` filtering) | 2 (`effectiveSteps` test) |
| Engine rule 2 (predicate / click / ack completion) | 2 (`isStepDone` tests), 10 (click capture listener) |
| Engine rule 3 (skip-ahead over predicates only) | 2 (four `advance` tests) |
| Engine rule 4 (missing or off-screen anchor collapses to the pill) | 1 (`isAnchorVisible`), 8 (`useAnchorRect`), 10 (`TourRunner` pill branch + test) |
| Engine rule 5 (Close pauses; pill offers Resume) | 9 (`CoachBubble` close test), 10 (`handleClose` + pill test) |
| Engine rule 6 (write-through to the server) | **phase 3** — the store keeps the run in memory; `progress` and `setProgress` are in place for hydration |
| Engine rule 7 (route changes never end a run; `new-game` follows into the workspace) | 10 (`bindGame` effect + test) |
| `features/tutorials/store.ts` — start/pause/resume/stop/ack/later/clicked/reset | 3 |
| `features/tutorials/mutationLog.ts` + `mutationKey` on the nine hooks | 4 |
| `features/tutorials/useTourState.ts`, `useTourActions.ts` | 10 |
| `features/tutorials/TourHost.tsx` mounted in the root route element | 10 |
| `features/tutorials/scenarios/index.ts` with an empty registry | 3 (deviation 1) |
| `components/tour/useAnchorRect.ts`, `placement.ts` | 8 |
| `components/tour/Spotlight.tsx` + story | 9 |
| `components/tour/CoachBubble.tsx` + story | 9 |
| `components/tour/TourPill.tsx` + story | 9 |
| Workspace store `readinessExpanded`, `setReadinessExpanded`, `setSettingsPanelOpen` | 5 |
| `ReadinessIndicator` expansion hoist + exported `useReadinessChecks` with `allPassed` | 5 |
| Groundwork ids: IconRail modes, dashboard empty state, arrange-route, enforce-base-order switch | 6 |
| `aria-pressed` on answer types, auto-validate, location-bound | 6 |
| `e2e/shared/web-helpers.ts` → `mode-{mode}` | 6 |
| `z-[70]` documented in `tokens.md` | 11 |
| `Spotlight` / `CoachBubble` / `TourPill` in `component-inventory.md` | 11 |
| "Guided tutorial" pattern with the non-blocking, prepare-don't-perform and mobile-sheet rules | 11 |
| "Tutorials" `HarnessSection` (default, long German, aside, later, pill) + `preview-matrix.md` row | 11 |
| Vitest for engine, store, dom, mutationLog, useAnchorRect, Spotlight, CoachBubble, TourPill, TourHost, workspace store, ReadinessIndicator | 1–11 |
| `tutorials.common.*` in en/pt/de | 7 (scope note) |

Deliberately **out** of phase 1, as the index requires: no scenario file, no welcome card, no `/tutorials` route, no server progress, no backend, no offline or full-stack Playwright, no revert-copy correction (that lands with the wave touching `GameSettingsPanel` copy, per the spec's build order item 5 and the index's i18n section, which assigns `lifecycle.revert.*` to a later phase).

### 2. Placeholder scan

No "TBD", "implement later", "add error handling", "similar to Task N", or "write tests for the above". Every code step carries the complete file or the complete replacement block. Three places defer to the repository rather than inventing a value, and each names exactly what to read and what the assertion is about:

- Task 4's `mutationKeys.test.ts` note about the game-status endpoint path — read `web/src/lib/api/games.ts`; the assertion is on the log key, not the URL.
- Task 6's `ChallengeDetail` test — reuse `createWrapper()` and the `<ChallengeDetail challengeId="challenge-1" gameId={gameId} />` render call already in `web/src/features/build/ChallengeDetail.test.tsx` (verified present).
- Task 10's `getBoundingClientRect` stub — the exact stub code is given inline.

The `predicateStep` helper in Task 2 Step 1 is written twice on purpose: the first form is wrong and the step immediately gives the correct replacement, so an engineer copying top-to-bottom ends with the right one. If that reads as noise, use only the second form.

### 3. Name consistency against the index contract

Checked symbol by symbol against `2026-09-06-operator-tutorials-0-index.md`:

- File paths: all thirteen phase-1 paths match the contract's layout block exactly.
- Types: `ScenarioId`, `ScenarioEntry`, `TutorialStatus`, `TutorialProgress`, `FieldReading`, `TourState` (all 27 fields, same names and types), `TourActions` (all 8), `StepDone`, `StepCopy`, `Step`, `Scenario` — verbatim.
- `Assignment` is the real exported name in `web/src/types/index.ts:155`, so no deviation is needed there.
- Engine: `effectiveSteps`, `isStepDone`, `advance`, `stepIndexOf`, `resolveAnchor`, `resolveBody` — same semantics including "ack and click steps are never auto-skipped"; `advance` is id-in/id-out and `stepIndexOf` is new (deviation 3).
- Store: every state field and action matches the contract, including `bumpTick` and `progress`; `currentStepId` / `setCurrentStep` replace `stepIndex` / `setStepIndex` and `complete` / `skip` are added (deviations 3 and 4).
- Tokens: `color.surface.tourScrim` is the only token source change; the generated adapters are regenerated, never hand-edited (deviation 7).
- `MUTATION_KEYS` keys and values match the contract's table row for row; all nine `mutationKey` tuples match.
- Workspace additions: `readinessExpanded`, `setReadinessExpanded`, `setSettingsPanelOpen`, exported `useReadinessChecks` with `allPassed`.
- Test ids: `mode-{build,command,review,results}`, `dashboard-empty-state`, `arrange-route-btn`, `enforce-base-order-switch`, `answer-type-group`, `tour-spotlight`, `tour-bubble`, `tour-bubble-title`, `tour-bubble-body`, `tour-next`, `tour-later`, `tour-close`, `tour-pill`, `tour-pill-resume` — all verbatim. `tour-spotlight-hole` and `tour-bubble-aside` are additions, not renames, and are declared in Global Constraints. `slide-drawer-close` and `drawer-close` already exist in the app and are neither added nor renamed here.
- Layering, portal targets, mask padding (8 px) and radius (8), the tour scrim variable, motion duration and easing, focus and Escape behaviour, capture-phase listeners with rAF throttling and the input debounce — all as the contract's "Layering and rendering rules" section states.
- i18n key names under `tutorials.common.*` match the contract's structure block.
- Two deviations, both declared at the top of this file: `SCENARIOS` partiality and the `Switch` `data-testid` prop.
