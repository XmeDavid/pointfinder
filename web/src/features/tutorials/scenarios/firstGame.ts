/**
 * `first-game` — the full lifecycle on the operator's own game.
 *
 * Pure data. Every completion rule reads `TourState`, which the host assembles
 * from the queries, the workspace store and the DOM; every `prepare` only
 * reveals an anchor through `TourActions` and never performs a domain action.
 *
 * Two rules shape the predicates below:
 *   - the engine auto-skips `predicate` steps that already pass, so a predicate
 *     that is true on arrival silently swallows its own coach mark. `base-name`
 *     and `challenge-title` therefore reject the prefilled default, and
 *     `base-method` / `challenge-type` — whose controls ship with a value already
 *     selected — use `click` and `ack` instead;
 *   - "saved" state comes from `s.bases` / `s.challenges` (the server view),
 *     never from the detail form's local fields, so `base-qr` and `base-nfc`
 *     branch on what was actually written.
 */
import type { Base } from '@/types'
import type { Scenario, Step, StepCopy, TourActions, TourState } from '../types'

const PREFILLED_BASE_NAME = /^Base \d+$/
const PREFILLED_CHALLENGE_TITLE = /^Challenge \d+$/

export function pressedAnswerType(s: TourState): 'text' | 'file' | 'none' | null {
  const pressed = s.pressedIn('answer-type-group')
  if (pressed === 'answer-type-text') return 'text'
  if (pressed === 'answer-type-file') return 'file'
  if (pressed === 'answer-type-none') return 'none'
  return null
}

function selectedBase(s: TourState): Base | null {
  return s.bases.find((b) => b.id === s.selectedBaseId) ?? null
}

function firstChallengeId(s: TourState): string {
  return s.challenges[0]?.id ?? ''
}

/** When a step completed, falling back to the start of the run. */
function since(s: TourState, stepId: string): number {
  return s.stepCompletedAt[stepId] ?? s.startedAt
}

function nfcStillPending(s: TourState): boolean {
  return s.laterSteps.has('base-nfc') && s.bases.some((b) => b.checkInMethod === 'NFC' && !b.nfcLinked)
}

/** `setMode` closes the drawer and settings as a side effect, so only switch when needed. */
function ensureBuild(a: TourActions, s: TourState): void {
  if (s.mode !== 'build') a.setMode('build')
}

function copyFor(stepId: string, extra?: { aside?: boolean; later?: boolean }): StepCopy {
  return {
    title: `tutorials.firstGame.${stepId}.title`,
    body: `tutorials.firstGame.${stepId}.body`,
    ...(extra?.aside ? { aside: `tutorials.firstGame.${stepId}.aside` } : {}),
    ...(extra?.later ? { later: `tutorials.firstGame.${stepId}.later` } : {}),
  }
}

const steps: Step[] = [
  {
    id: 'create-game',
    route: 'dashboard',
    anchor: 'create-game-btn',
    done: {
      kind: 'predicate',
      test: (s) => {
        const id = s.routeGameId
        if (!id || s.gamesAtStart.includes(id)) return false
        const game = s.games.find((g) => g.id === id) ?? (s.game?.id === id ? s.game : null)
        return game?.status === 'setup'
      },
    },
    copy: copyFor('create-game'),
  },
  {
    id: 'orient',
    route: 'workspace',
    anchor: 'readiness-indicator',
    prepare: ensureBuild,
    done: { kind: 'ack' },
    copy: copyFor('orient', { aside: true }),
  },
  {
    id: 'place-base',
    route: 'workspace',
    anchor: 'map-wrapper',
    prepare: ensureBuild,
    done: { kind: 'predicate', test: (s) => s.bases.length >= 1 },
    copy: copyFor('place-base'),
  },
  {
    id: 'base-name',
    route: 'workspace',
    anchor: 'base-name-input',
    prepare: (a, s) => a.selectBase(s.selectedBaseId ?? s.bases[0]?.id ?? null),
    done: {
      kind: 'predicate',
      test: (s) => {
        const name = s.field('base-name-input').value
        return name !== '' && !PREFILLED_BASE_NAME.test(name)
      },
    },
    copy: copyFor('base-name'),
  },
  {
    id: 'base-description',
    route: 'workspace',
    anchor: 'base-description-input',
    done: { kind: 'ack' },
    copy: copyFor('base-description'),
  },
  {
    id: 'base-coords',
    route: 'workspace',
    anchor: 'base-lat-input',
    done: { kind: 'ack' },
    copy: copyFor('base-coords'),
  },
  {
    id: 'base-method',
    route: 'workspace',
    anchor: 'base-checkin-method',
    // A method is always preselected, so "chosen" has to mean "the operator tapped one".
    done: { kind: 'click' },
    copy: copyFor('base-method'),
  },
  {
    id: 'base-radius',
    route: 'workspace',
    anchor: 'base-checkin-radius',
    when: (s) => s.pressedIn('base-checkin-method') === 'base-checkin-method-location',
    // An explanation, not a demand: the inherited game default is a valid
    // radius, and an out-of-range value is rejected by the form itself.
    done: { kind: 'ack' },
    copy: copyFor('base-radius', { aside: true }),
  },
  {
    id: 'base-visibility',
    route: 'workspace',
    anchor: 'visibility-visible',
    done: { kind: 'ack' },
    copy: copyFor('base-visibility'),
  },
  {
    id: 'base-link',
    route: 'workspace',
    anchor: 'link-challenge-btn',
    done: { kind: 'ack' },
    copy: copyFor('base-link'),
  },
  {
    id: 'base-save',
    route: 'workspace',
    anchor: 'save-base-btn',
    done: {
      kind: 'predicate',
      test: (s) => (s.lastSuccess['base:update'] ?? 0) > since(s, 'base-name'),
    },
    copy: copyFor('base-save'),
  },
  {
    id: 'base-qr',
    route: 'workspace',
    anchor: 'base-qr-print',
    when: (s) => selectedBase(s)?.checkInMethod === 'QR',
    // Done once the print sheet has been opened and closed again: completing on
    // the click alone would let the next step deselect the base and unmount the
    // sheet under the operator.
    done: {
      kind: 'predicate',
      test: (s) => s.clickedSteps.has('base-qr') && !s.field('codes-print-sheet').present,
    },
    copy: copyFor('base-qr'),
  },
  {
    id: 'base-nfc',
    route: 'workspace',
    anchor: (s) => (s.isNative ? `nfc-write-${s.selectedBaseId ?? ''}` : 'tab-nfc'),
    when: (s) => {
      const base = selectedBase(s)
      return base?.checkInMethod === 'NFC' && !base.nfcLinked
    },
    prepare: (a, s) => {
      if (!s.drawerOpen) a.openDrawer('bases')
    },
    done: {
      kind: 'predicate',
      test: (s) => selectedBase(s)?.nfcLinked === true || s.laterSteps.has('base-nfc'),
    },
    copy: copyFor('base-nfc', { aside: true, later: true }),
  },
  {
    id: 'second-base',
    route: 'workspace',
    anchor: 'map-wrapper',
    prepare: (a) => a.selectBase(null),
    done: { kind: 'predicate', test: (s) => s.bases.length >= 2 },
    copy: copyFor('second-base'),
  },
  {
    id: 'new-challenge',
    route: 'workspace',
    anchor: 'new-entity-btn',
    prepare: (a) => a.openDrawer('challenges'),
    done: { kind: 'predicate', test: (s) => s.challenges.length >= 1 },
    copy: copyFor('new-challenge'),
  },
  {
    id: 'challenge-title',
    route: 'workspace',
    anchor: 'challenge-title-input',
    prepare: (a, s) => a.selectChallenge(s.selectedChallengeId ?? s.challenges[0]?.id ?? null),
    done: {
      kind: 'predicate',
      test: (s) => {
        const title = s.field('challenge-title-input').value
        return title !== '' && !PREFILLED_CHALLENGE_TITLE.test(title)
      },
    },
    copy: copyFor('challenge-title'),
  },
  {
    id: 'challenge-type',
    route: 'workspace',
    anchor: 'answer-type-group',
    // Text is preselected on every new challenge, so a "type chosen" predicate self-completes.
    done: { kind: 'ack' },
    copy: copyFor('challenge-type'),
  },
  {
    id: 'challenge-content',
    route: 'workspace',
    anchor: 'challenge-content',
    done: { kind: 'predicate', test: (s) => s.field('challenge-content').value !== '' },
    copy: copyFor('challenge-content'),
  },
  {
    id: 'challenge-description',
    route: 'workspace',
    anchor: 'challenge-description',
    done: { kind: 'ack' },
    copy: copyFor('challenge-description'),
  },
  {
    id: 'challenge-autovalidate',
    route: 'workspace',
    anchor: 'auto-validate-toggle',
    done: { kind: 'ack' },
    copy: copyFor('challenge-autovalidate'),
  },
  {
    id: 'challenge-answer',
    route: 'workspace',
    anchor: 'correct-answer-input',
    when: (s) => s.field('auto-validate-toggle').pressed === true && pressedAnswerType(s) === 'text',
    done: { kind: 'predicate', test: (s) => s.field('correct-answer-input').value !== '' },
    copy: copyFor('challenge-answer'),
  },
  {
    id: 'challenge-points',
    route: 'workspace',
    anchor: 'points-input',
    done: { kind: 'ack' },
    copy: copyFor('challenge-points'),
  },
  {
    id: 'challenge-completion',
    route: 'workspace',
    anchor: 'completion-content',
    done: { kind: 'ack' },
    copy: copyFor('challenge-completion'),
  },
  {
    id: 'challenge-location-bound',
    route: 'workspace',
    anchor: 'location-bound-toggle',
    done: { kind: 'ack' },
    copy: copyFor('challenge-location-bound'),
  },
  {
    id: 'challenge-notes',
    route: 'workspace',
    anchor: 'operator-notes',
    done: { kind: 'ack' },
    copy: copyFor('challenge-notes'),
  },
  {
    id: 'challenge-save',
    route: 'workspace',
    anchor: 'save-challenge',
    done: {
      kind: 'predicate',
      test: (s) => (s.lastSuccess['challenge:update'] ?? 0) > since(s, 'challenge-title'),
    },
    copy: copyFor('challenge-save'),
  },
  {
    id: 'more-challenges',
    route: 'workspace',
    anchor: 'new-entity-btn',
    prepare: (a) => {
      a.selectChallenge(null)
      a.openDrawer('challenges')
    },
    done: { kind: 'predicate', test: (s) => s.challenges.length >= s.bases.length },
    copy: copyFor('more-challenges'),
  },
  {
    id: 'assign',
    route: 'workspace',
    anchor: 'auto-assign-btn',
    prepare: (a) => a.openDrawer('bases'),
    done: {
      kind: 'predicate',
      test: (s) =>
        s.bases.length > 0 &&
        s.bases.every(
          (base) =>
            Boolean(base.fixedChallengeId) ||
            s.assignments.some((assignment) => assignment.baseId === base.id),
        ),
    },
    copy: copyFor('assign'),
  },
  {
    id: 'new-team',
    route: 'workspace',
    anchor: 'new-entity-btn',
    prepare: (a) => a.openDrawer('teams'),
    done: { kind: 'predicate', test: (s) => s.teams.length >= 1 },
    copy: copyFor('new-team'),
  },
  {
    id: 'team-code',
    route: 'workspace',
    anchor: 'team-join-code',
    prepare: (a, s) => a.selectTeam(s.selectedTeamId ?? s.teams[0]?.id ?? null),
    done: { kind: 'ack' },
    copy: copyFor('team-code'),
  },
  {
    id: 'go-live',
    route: 'workspace',
    // `go-live-btn` only mounts inside the expanded checklist once every check passes.
    anchor: (s) => (s.readiness.allPassed ? 'go-live-btn' : 'readiness-indicator'),
    prepare: (a, s) => {
      ensureBuild(a, s)
      // The readiness panel sits behind the drawer's scrim while a tab is open.
      a.closeDrawer()
      a.setSettingsPanelOpen(false)
      a.setReadinessExpanded(true)
    },
    done: { kind: 'predicate', test: (s) => s.game?.status === 'live' },
    copy: copyFor('go-live'),
    branchCopy: [
      { when: nfcStillPending, body: 'tutorials.firstGame.go-live.branch.nfcPending' },
      { when: (s) => !s.readiness.allPassed, body: 'tutorials.firstGame.go-live.branch.notReady' },
    ],
  },
  {
    id: 'modes',
    route: 'workspace',
    anchor: 'mode-command',
    prepare: (a) => a.closeDrawer(),
    done: { kind: 'ack' },
    copy: copyFor('modes'),
  },
  {
    id: 'revert',
    route: 'workspace',
    anchor: 'revert-to-setup-btn',
    prepare: (a) => {
      a.closeDrawer()
      a.setSettingsPanelOpen(true)
    },
    done: { kind: 'predicate', test: (s) => s.game?.status === 'setup' },
    copy: copyFor('revert'),
  },
  {
    id: 'edit',
    route: 'workspace',
    anchor: (s) => `challenge-item-${firstChallengeId(s)}`,
    prepare: (a, s) => {
      a.setSettingsPanelOpen(false)
      ensureBuild(a, s)
      a.openDrawer('challenges')
    },
    done: {
      kind: 'predicate',
      test: (s) => (s.lastSuccess['challenge:update'] ?? 0) > since(s, 'revert'),
    },
    copy: copyFor('edit'),
  },
  {
    id: 'go-live-again',
    route: 'workspace',
    anchor: (s) => (s.readiness.allPassed ? 'go-live-btn' : 'readiness-indicator'),
    prepare: (a, s) => {
      ensureBuild(a, s)
      // The readiness panel sits behind the drawer's scrim while a tab is open.
      a.closeDrawer()
      a.setSettingsPanelOpen(false)
      a.setReadinessExpanded(true)
    },
    done: { kind: 'predicate', test: (s) => s.game?.status === 'live' },
    copy: copyFor('go-live-again'),
  },
  {
    id: 'finish',
    // No anchor: the closing card is centred and dims nothing.
    anchor: '',
    done: { kind: 'ack' },
    copy: copyFor('finish'),
  },
]

export const firstGame: Scenario = {
  id: 'first-game',
  entry: 'new-game',
  title: 'tutorials.scenarios.firstGame.title',
  blurb: 'tutorials.scenarios.firstGame.blurb',
  steps,
}
