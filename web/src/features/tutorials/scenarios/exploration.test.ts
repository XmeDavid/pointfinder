import { describe, expect, it, vi } from 'vitest'
import { resources, keyPaths } from '@pointfinder/i18n'
import { createMockBase } from '@/test/factories/base'
import { createMockChallenge } from '@/test/factories/challenge'
import { isKnownAnchor } from '../anchors'
import { advance, effectiveSteps, resolveAnchor } from '../engine'
import { makeTourState, type TourStateOverrides } from '../testState'
import type { TourActions } from '../types'
import { exploration } from './exploration'

const NO_CLICKS: ReadonlySet<string> = new Set<string>()
const TWO_BASES = [createMockBase({ id: 'b1' }), createMockBase({ id: 'b2' })]

describe('exploration scenario definition', () => {
  it('is a setup-game scenario with its step ids in order', () => {
    expect(exploration.id).toBe('exploration')
    expect(exploration.entry).toBe('setup-game')
    expect(exploration.steps.map((s) => s.id)).toEqual(['place-first', 'pick-base', 'hide', 'hide-save', 'clue', 'readiness'])
    expect(new Set(exploration.steps.map((s) => s.id)).size).toBe(exploration.steps.length)
  })

  it('shows exactly one of place-first and pick-base', () => {
    const empty = effectiveSteps(exploration, makeTourState({ bases: [] })).map((s) => s.id)
    expect(empty).toContain('place-first')
    expect(empty).not.toContain('pick-base')
    const withBases = effectiveSteps(exploration, makeTourState({ bases: TWO_BASES })).map((s) => s.id)
    expect(withBases).toContain('pick-base')
    expect(withBases).not.toContain('place-first')
  })

  it('drops the clue step when the game has no challenges', () => {
    const ids = effectiveSteps(exploration, makeTourState({ bases: TWO_BASES })).map((s) => s.id)
    expect(ids).not.toContain('clue')
    const withChallenge = effectiveSteps(
      exploration,
      makeTourState({ bases: TWO_BASES, challenges: [createMockChallenge({ id: 'c1' })] }),
    ).map((s) => s.id)
    expect(withChallenge).toContain('clue')
  })

  it('anchors only test ids the app is known to render', () => {
    const state = makeTourState({ bases: TWO_BASES, challenges: [createMockChallenge({ id: 'c1' })] })
    for (const step of exploration.steps) {
      expect(isKnownAnchor(resolveAnchor(step, state)), `${step.id} anchor`).toBe(true)
      expect(step.route, step.id).toBe('workspace')
    }
  })

  it('anchors pick-base at the first base', () => {
    const step = exploration.steps.find((s) => s.id === 'pick-base')!
    expect(resolveAnchor(step, makeTourState({ bases: TWO_BASES }))).toBe('base-item-b1')
  })

  it.each(['en', 'pt', 'de'] as const)('has every copy key in %s', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    expect(paths.has(exploration.title)).toBe(true)
    expect(paths.has(exploration.blurb)).toBe(true)
    for (const step of exploration.steps) {
      expect(paths.has(step.copy.title), `${step.id} title`).toBe(true)
      expect(paths.has(step.copy.body), `${step.id} body`).toBe(true)
    }
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
    for (const step of exploration.steps) step.prepare?.(actions, makeTourState({ mode: 'build', bases: TWO_BASES }))
    expect(setMode).not.toHaveBeenCalled()
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
    closeDrawer: () => {},
    navigate: () => {},
  } as unknown as TourActions

  function prepareClue(state: TourStateOverrides): Array<[string, string | null]> {
    calls.length = 0
    exploration.steps.find((s) => s.id === 'clue')!.prepare?.(actions, makeTourState(state))
    return [...calls]
  }

  it('prefers the challenge pinned to the selected base', () => {
    expect(
      prepareClue({
        selectedBaseId: 'b1',
        bases: [createMockBase({ id: 'b1', hidden: true, fixedChallengeId: 'c9' }), createMockBase({ id: 'b2' })],
        challenges: [createMockChallenge({ id: 'c1' }), createMockChallenge({ id: 'c9' })],
      }),
    ).toEqual([['openDrawer', 'challenges'], ['selectChallenge', 'c9']])
  })

  it('falls back to an assignment on the selected base', () => {
    expect(
      prepareClue({
        selectedBaseId: 'b1',
        bases: TWO_BASES,
        challenges: [createMockChallenge({ id: 'c1' }), createMockChallenge({ id: 'c5' })],
        assignments: [{ id: 'a1', gameId: 'g1', baseId: 'b1', challengeId: 'c5' }],
      }),
    ).toEqual([['openDrawer', 'challenges'], ['selectChallenge', 'c5']])
  })

  it('falls back to the first challenge', () => {
    expect(prepareClue({ selectedBaseId: 'b1', bases: TWO_BASES, challenges: [createMockChallenge({ id: 'c1' })] })).toEqual([
      ['openDrawer', 'challenges'],
      ['selectChallenge', 'c1'],
    ])
  })

  it('opens the tab but selects nothing when there is no challenge', () => {
    expect(prepareClue({ selectedBaseId: 'b1', bases: TWO_BASES })).toEqual([['openDrawer', 'challenges']])
  })
})

describe('exploration advance()', () => {
  const hiddenSaved = [createMockBase({ id: 'b1', hidden: true }), createMockBase({ id: 'b2' })]
  const cases: Array<{ name: string; state: TourStateOverrides; expectId: string | null }> = [
    { name: 'no bases → place-first', state: { bases: [] }, expectId: 'place-first' },
    { name: 'bases but none selected → pick-base', state: { bases: TWO_BASES }, expectId: 'pick-base' },
    { name: 'base selected → hide', state: { bases: TWO_BASES, selectedBaseId: 'b1' }, expectId: 'hide' },
    {
      name: 'hidden pressed but unsaved → hide-save',
      state: { bases: TWO_BASES, selectedBaseId: 'b1', fields: { 'visibility-hidden': { present: true, pressed: true } } },
      expectId: 'hide-save',
    },
    {
      name: 'saved hidden with a challenge → clue',
      state: {
        bases: hiddenSaved,
        selectedBaseId: 'b1',
        challenges: [createMockChallenge({ id: 'c1' })],
        fields: { 'visibility-hidden': { present: true, pressed: true } },
      },
      expectId: 'clue',
    },
    {
      name: 'saved hidden with no challenges → readiness',
      state: { bases: hiddenSaved, selectedBaseId: 'b1', fields: { 'visibility-hidden': { present: true, pressed: true } } },
      expectId: 'readiness',
    },
    {
      name: 'clue acked → readiness',
      state: {
        bases: hiddenSaved,
        selectedBaseId: 'b1',
        challenges: [createMockChallenge({ id: 'c1' })],
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
        challenges: [createMockChallenge({ id: 'c1' })],
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
