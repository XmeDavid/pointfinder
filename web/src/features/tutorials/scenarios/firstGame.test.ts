import { describe, expect, it, vi } from 'vitest'
import { keyPaths, resources } from '@pointfinder/i18n'
import { createMockGame } from '@/test/factories/game'
import { createMockBase } from '@/test/factories/base'
import { createMockChallenge } from '@/test/factories/challenge'
import { createMockTeam } from '@/test/factories/team'
import { isKnownAnchor } from '../anchors'
import { advance, effectiveSteps, resolveAnchor, resolveBody } from '../engine'
import { makeTourState, type TourStateOverrides } from '../testState'
import type { TourActions, TourState } from '../types'
import { firstGame, pressedAnswerType } from './firstGame'
import { SCENARIOS } from './index'

const STEP_IDS = [
  'create-game', 'name-game', 'orient', 'place-base', 'base-name', 'base-description', 'base-coords',
  'base-method', 'base-radius', 'base-visibility', 'base-link', 'base-save', 'base-qr',
  'base-nfc', 'second-base', 'new-challenge', 'challenge-title', 'challenge-type',
  'challenge-content', 'challenge-description', 'challenge-autovalidate', 'challenge-answer',
  'challenge-points', 'challenge-completion', 'challenge-location-bound', 'challenge-notes',
  'challenge-save', 'more-challenges', 'assign', 'new-team', 'team-code', 'go-live', 'modes',
  'revert', 'edit', 'go-live-again', 'finish',
]

const state = (over: TourStateOverrides = {}) => makeTourState({ startedAt: 100, isDashboard: true, ...over })

/** id of the step `advance` lands on, starting at (and including) `from`. */
function nextStepId(s: TourState, from: string | null = null, clicked: Set<string> = new Set()): string | null {
  return advance(firstGame, s, clicked, from)
}

function predicateOf(id: string): (s: TourState) => boolean {
  const step = firstGame.steps.find((s) => s.id === id)!
  expect(step.done.kind).toBe('predicate')
  return (step.done as { test: (s: TourState) => boolean }).test
}

describe('first-game scenario definition', () => {
  it('is registered under its contract id with the new-game entry', () => {
    expect(SCENARIOS['first-game']).toBe(firstGame)
    expect(firstGame.id).toBe('first-game')
    expect(firstGame.entry).toBe('new-game')
    expect(firstGame.title).toBe('tutorials.scenarios.firstGame.title')
    expect(firstGame.blurb).toBe('tutorials.scenarios.firstGame.blurb')
  })

  it('carries the contract step ids exactly once, in order', () => {
    expect(firstGame.steps.map((s) => s.id)).toEqual(STEP_IDS)
    expect(new Set(STEP_IDS).size).toBe(STEP_IDS.length)
  })

  it('only points at anchors the app actually renders', () => {
    const probe = state({
      selectedBaseId: 'b1',
      challenges: [createMockChallenge({ id: 'c1' })],
      readiness: { allPassed: true, failing: [] },
    })
    for (const step of firstGame.steps) {
      const anchor = resolveAnchor(step, probe)
      if (anchor === '') continue // the closing card has no anchor by design
      expect(isKnownAnchor(anchor), `${step.id} → ${anchor}`).toBe(true)
    }
  })

  it('marks every workspace step with its route so Resume can navigate back', () => {
    for (const step of firstGame.steps) {
      if (step.id === 'create-game' || step.id === 'name-game') expect(step.route).toBe('dashboard')
      else if (step.id === 'finish') expect(step.route).toBeUndefined()
      else expect(step.route, step.id).toBe('workspace')
    }
  })

  it('resolves the native and browser NFC anchors', () => {
    const step = firstGame.steps.find((s) => s.id === 'base-nfc')!
    expect(resolveAnchor(step, state({ isNative: true, selectedBaseId: 'b7' }))).toBe('nfc-write-b7')
    expect(resolveAnchor(step, state({ isNative: false, selectedBaseId: 'b7' }))).toBe('tab-nfc')
  })

  it('falls back from the go-live button to the readiness pill until every check passes', () => {
    for (const id of ['go-live', 'go-live-again']) {
      const step = firstGame.steps.find((s) => s.id === id)!
      expect(resolveAnchor(step, state({ readiness: { allPassed: false, failing: ['Bases'] } }))).toBe('readiness-indicator')
      expect(resolveAnchor(step, state({ readiness: { allPassed: true, failing: [] } }))).toBe('go-live-btn')
    }
  })

  it.each(['en', 'pt', 'de'] as const)('has every copy key in %s', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const step of firstGame.steps) {
      for (const key of [step.copy.title, step.copy.body, step.copy.aside, step.copy.later]) {
        if (key) expect(paths.has(key), `${lang} ${key}`).toBe(true)
      }
      for (const branch of step.branchCopy ?? []) {
        expect(paths.has(branch.body), `${lang} ${branch.body}`).toBe(true)
      }
    }
  })

  it('reads the pressed answer type from the button group', () => {
    expect(pressedAnswerType(state({ pressedGroups: { 'answer-type-group': 'answer-type-file' } }))).toBe('file')
    expect(pressedAnswerType(state({ pressedGroups: { 'answer-type-group': null } }))).toBeNull()
  })

  it('never switches mode when the workspace is already in build mode', () => {
    const setMode = vi.fn()
    const actions = {
      setMode,
      openDrawer: vi.fn(),
      selectBase: vi.fn(),
      selectChallenge: vi.fn(),
      selectTeam: vi.fn(),
      setReadinessExpanded: vi.fn(),
      setSettingsPanelOpen: vi.fn(),
      closeDrawer: vi.fn(),
      navigate: vi.fn(),
    } as unknown as TourActions
    for (const step of firstGame.steps) step.prepare?.(actions, state({ mode: 'build' }))
    expect(setMode).not.toHaveBeenCalled()

    firstGame.steps.find((s) => s.id === 'go-live')!.prepare?.(actions, state({ mode: 'command' }))
    expect(setMode).toHaveBeenCalledWith('build')
  })

  it('opens the bases drawer for the NFC step only when it is closed', () => {
    const openDrawer = vi.fn()
    const actions = { openDrawer } as unknown as TourActions
    const step = firstGame.steps.find((s) => s.id === 'base-nfc')!
    step.prepare?.(actions, state({ drawerOpen: false }))
    expect(openDrawer).toHaveBeenCalledWith('bases')
    openDrawer.mockClear()
    step.prepare?.(actions, state({ drawerOpen: true }))
    expect(openDrawer).not.toHaveBeenCalled()
  })
})

describe('first-game when guards', () => {
  const saved = (over: Partial<ReturnType<typeof createMockBase>>) =>
    state({ selectedBaseId: 'b1', bases: [createMockBase({ id: 'b1', ...over })] })

  it('includes the radius step only while the location method is pressed', () => {
    const location = state({ pressedGroups: { 'base-checkin-method': 'base-checkin-method-location' } })
    const nfc = state({ pressedGroups: { 'base-checkin-method': 'base-checkin-method-nfc' } })
    expect(effectiveSteps(firstGame, location).map((s) => s.id)).toContain('base-radius')
    expect(effectiveSteps(firstGame, nfc).map((s) => s.id)).not.toContain('base-radius')
  })

  it('includes the QR step and drops the NFC step for a saved QR base', () => {
    const ids = effectiveSteps(firstGame, saved({ checkInMethod: 'QR' })).map((s) => s.id)
    expect(ids).toContain('base-qr')
    expect(ids).not.toContain('base-nfc')
  })

  it('includes the NFC step only for a saved NFC base with no tag written', () => {
    const unlinked = effectiveSteps(firstGame, saved({ checkInMethod: 'NFC', nfcLinked: false })).map((s) => s.id)
    const linked = effectiveSteps(firstGame, saved({ checkInMethod: 'NFC', nfcLinked: true })).map((s) => s.id)
    expect(unlinked).toContain('base-nfc')
    expect(linked).not.toContain('base-nfc')
  })

  it('includes the correct-answer step only for auto-validated text challenges', () => {
    const on = state({
      fields: { 'auto-validate-toggle': { present: true, pressed: true } },
      pressedGroups: { 'answer-type-group': 'answer-type-text' },
    })
    const file = state({
      fields: { 'auto-validate-toggle': { present: true, pressed: true } },
      pressedGroups: { 'answer-type-group': 'answer-type-file' },
    })
    expect(effectiveSteps(firstGame, on).map((s) => s.id)).toContain('challenge-answer')
    expect(effectiveSteps(firstGame, file).map((s) => s.id)).not.toContain('challenge-answer')
  })
})

describe('first-game advance', () => {
  const setupGame = createMockGame({ id: 'g1', status: 'setup' })
  const liveGame = createMockGame({ id: 'g1', status: 'live' })
  const inWorkspace = { routeGameId: 'g1', games: [setupGame], game: setupGame, isDashboard: false }

  const cases: Array<{ name: string; state: TourState; clicked?: Set<string>; from?: string; expected: string | null }> = [
    {
      name: 'a fresh run starts on the create-game button',
      state: state(),
      expected: 'create-game',
    },
    {
      name: 'tapping New Game follows the operator into the dialog',
      state: state({ clickedSteps: new Set(['create-game']) }),
      expected: 'name-game',
    },
    {
      name: 'creating a game moves on to the readiness pill',
      state: state(inWorkspace),
      expected: 'orient',
    },
    {
      name: 'a game that already existed does not count as created',
      state: state({ ...inWorkspace, gamesAtStart: ['g1'] }),
      expected: 'create-game',
    },
    {
      name: 'a placed base opens the field walkthrough at the name',
      state: state({
        ...inWorkspace,
        bases: [createMockBase({ id: 'b1', name: 'Base 1' })], selectedBaseId: 'b1',
        ackedSteps: new Set(['orient']),
        fields: { 'base-name-input': { present: true, value: 'Base 1' } },
      }),
      expected: 'base-name',
    },
    {
      name: 'a renamed base moves on to the description',
      state: state({
        ...inWorkspace,
        bases: [createMockBase({ id: 'b1', name: 'Old mill' })], selectedBaseId: 'b1',
        ackedSteps: new Set(['orient']),
        fields: { 'base-name-input': { present: true, value: 'Old mill' } },
      }),
      expected: 'base-description',
    },
    {
      name: 'pressing the location method inserts the radius step',
      state: state({
        ...inWorkspace,
        bases: [createMockBase({ id: 'b1', name: 'Old mill' })], selectedBaseId: 'b1',
        ackedSteps: new Set(['orient', 'base-description', 'base-coords']),
        fields: { 'base-name-input': { present: true, value: 'Old mill' } },
        pressedGroups: { 'base-checkin-method': 'base-checkin-method-location' },
      }),
      clicked: new Set(['base-method']),
      expected: 'base-radius',
    },
    {
      name: 'a saved QR base asks for the printed code',
      state: state({
        ...inWorkspace,
        bases: [createMockBase({ id: 'b1', name: 'Old mill', checkInMethod: 'QR' })],
        selectedBaseId: 'b1',
        stepCompletedAt: { 'base-name': 200 },
        lastSuccess: { 'base:update': 300 },
      }),
      from: 'base-save',
      expected: 'base-qr',
    },
    {
      name: 'the printed code keeps its step while the print sheet is open',
      state: state({
        ...inWorkspace,
        bases: [createMockBase({ id: 'b1', name: 'Old mill', checkInMethod: 'QR' })],
        selectedBaseId: 'b1',
        stepCompletedAt: { 'base-name': 200 },
        lastSuccess: { 'base:update': 300 },
        clickedSteps: new Set(['base-qr']),
        fields: { 'codes-print-sheet': { present: true } },
      }),
      from: 'base-qr',
      expected: 'base-qr',
    },
    {
      name: 'closing the print sheet after printing moves to the second base',
      state: state({
        ...inWorkspace,
        bases: [createMockBase({ id: 'b1', name: 'Old mill', checkInMethod: 'QR' })],
        selectedBaseId: 'b1',
        stepCompletedAt: { 'base-name': 200 },
        lastSuccess: { 'base:update': 300 },
        clickedSteps: new Set(['base-qr']),
      }),
      from: 'base-qr',
      expected: 'second-base',
    },
    {
      name: 'a saved unlinked NFC base asks for the tag',
      state: state({
        ...inWorkspace,
        bases: [createMockBase({ id: 'b1', name: 'Old mill', checkInMethod: 'NFC', nfcLinked: false })],
        selectedBaseId: 'b1',
        stepCompletedAt: { 'base-name': 200 },
        lastSuccess: { 'base:update': 300 },
      }),
      from: 'base-save',
      expected: 'base-nfc',
    },
    {
      name: 'pressing "later" clears the NFC step and moves to the second base',
      state: state({
        ...inWorkspace,
        bases: [createMockBase({ id: 'b1', name: 'Old mill', checkInMethod: 'NFC', nfcLinked: false })],
        selectedBaseId: 'b1',
        stepCompletedAt: { 'base-name': 200 },
        lastSuccess: { 'base:update': 300 },
        laterSteps: new Set(['base-nfc']),
      }),
      from: 'base-nfc',
      expected: 'second-base',
    },
    {
      name: 'a live game moves from go-live to the mode tour',
      state: state({
        routeGameId: 'g1', games: [liveGame], game: liveGame, isDashboard: false,
        readiness: { allPassed: true, failing: [] },
      }),
      from: 'go-live',
      expected: 'modes',
    },
    {
      name: 'reverting to setup moves on to the edit step',
      state: state({
        ...inWorkspace,
        challenges: [createMockChallenge({ id: 'c1' })],
        ackedSteps: new Set(['modes']),
      }),
      from: 'revert',
      expected: 'edit',
    },
    {
      name: 'a challenge saved after the revert moves on to the second go-live',
      state: state({
        ...inWorkspace,
        challenges: [createMockChallenge({ id: 'c1' })],
        stepCompletedAt: { revert: 500 },
        lastSuccess: { 'challenge:update': 900 },
      }),
      from: 'edit',
      expected: 'go-live-again',
    },
    {
      name: 'the closing card waits for Got it',
      state: state({ routeGameId: 'g1', games: [liveGame], game: liveGame, isDashboard: false }),
      from: 'go-live-again',
      expected: 'finish',
    },
  ]

  it.each(cases)('$name', ({ state: s, clicked, from, expected }) => {
    expect(nextStepId(s, from ?? null, clicked ?? new Set())).toBe(expected)
  })

  it('swaps in the pending-tag body on the go-live step', () => {
    const step = firstGame.steps.find((s) => s.id === 'go-live')!
    const pending = state({
      laterSteps: new Set(['base-nfc']),
      bases: [createMockBase({ id: 'b1', checkInMethod: 'NFC', nfcLinked: false })],
      readiness: { allPassed: false, failing: ['NFC tags'] },
    })
    expect(resolveBody(step, pending)).toBe('tutorials.firstGame.go-live.branch.nfcPending')
  })

  it('swaps in the not-ready body when checks are red for another reason', () => {
    const step = firstGame.steps.find((s) => s.id === 'go-live')!
    expect(resolveBody(step, state({ readiness: { allPassed: false, failing: ['At least one team'] } }))).toBe(
      'tutorials.firstGame.go-live.branch.notReady',
    )
  })

  it('uses the plain body once every check is green', () => {
    const step = firstGame.steps.find((s) => s.id === 'go-live')!
    expect(resolveBody(step, state({ readiness: { allPassed: true, failing: [] } }))).toBe('tutorials.firstGame.go-live.body')
  })

  it('completes the assignment step once every base is covered', () => {
    const test = predicateOf('assign')
    const covered = state({
      bases: [createMockBase({ id: 'b1' }), createMockBase({ id: 'b2', fixedChallengeId: 'c9' })],
      assignments: [{ id: 'a1', gameId: 'g1', baseId: 'b1', challengeId: 'c1' }],
    })
    const uncovered = state({ bases: [createMockBase({ id: 'b1' }), createMockBase({ id: 'b2' })] })
    expect(test(covered)).toBe(true)
    expect(test(uncovered)).toBe(false)
    expect(test(state())).toBe(false)
  })

  it('waits for a team before showing the join code', () => {
    const test = predicateOf('new-team')
    expect(test(state())).toBe(false)
    expect(test(state({ teams: [createMockTeam({ id: 't1' })] }))).toBe(true)
  })

  it('explains the radius and accepts the inherited default with Next', () => {
    const step = firstGame.steps.find((s) => s.id === 'base-radius')!
    expect(step.done.kind).toBe('ack')
  })
})
