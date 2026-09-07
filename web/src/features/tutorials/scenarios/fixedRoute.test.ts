import { describe, expect, it, vi } from 'vitest'
import { resources, keyPaths } from '@pointfinder/i18n'
import { createMockGame } from '@/test/factories/game'
import { isKnownAnchor } from '../anchors'
import { advance, effectiveSteps, resolveAnchor, resolveBody } from '../engine'
import { makeTourState, type TourStateOverrides } from '../testState'
import type { TourActions } from '../types'
import { fixedRoute } from './fixedRoute'

const NO_CLICKS: ReadonlySet<string> = new Set<string>()
const TWO_BASES = [{ id: 'b1' }, { id: 'b2' }] as never

describe('fixed-route scenario definition', () => {
  it('is a setup-game scenario with the contract step ids in order', () => {
    expect(fixedRoute.id).toBe('fixed-route')
    expect(fixedRoute.entry).toBe('setup-game')
    expect(fixedRoute.steps.map((s) => s.id)).toEqual(['enable-order', 'unlock-trigger', 'add-bases', 'arrange', 'route', 'readiness'])
    expect(new Set(fixedRoute.steps.map((s) => s.id)).size).toBe(fixedRoute.steps.length)
  })

  it('anchors only test ids the app is known to render', () => {
    const state = makeTourState({ game: createMockGame({ unlockTrigger: 'SUBMISSION' }) })
    for (const step of fixedRoute.steps) {
      expect(isKnownAnchor(resolveAnchor(step, state)), `${step.id} anchor`).toBe(true)
      expect(step.route, step.id).toBe('workspace')
    }
  })

  it('falls back to CHECK_IN when the game has no unlock trigger yet', () => {
    const step = fixedRoute.steps.find((s) => s.id === 'unlock-trigger')!
    expect(resolveAnchor(step, makeTourState({ game: null }))).toBe('unlock-trigger-CHECK_IN')
    expect(resolveAnchor(step, makeTourState({ game: createMockGame({ unlockTrigger: 'COMPLETED' }) }))).toBe(
      'unlock-trigger-COMPLETED',
    )
  })

  it.each(['en', 'pt', 'de'] as const)('has every copy key in %s', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    expect(paths.has(fixedRoute.title)).toBe(true)
    expect(paths.has(fixedRoute.blurb)).toBe(true)
    for (const step of fixedRoute.steps) {
      expect(paths.has(step.copy.title), `${step.id} title`).toBe(true)
      expect(paths.has(step.copy.body), `${step.id} body`).toBe(true)
      for (const branch of step.branchCopy ?? []) expect(paths.has(branch.body), `${step.id} branch`).toBe(true)
    }
  })

  it('asks for bases first when the game has fewer than two, and only then', () => {
    const oneBase = makeTourState({ bases: [{ id: 'b1' }] as never })
    const twoBases = makeTourState({ bases: TWO_BASES })
    expect(effectiveSteps(fixedRoute, oneBase).map((s) => s.id)).toContain('add-bases')
    expect(effectiveSteps(fixedRoute, twoBases).map((s) => s.id)).not.toContain('add-bases')
    const arrange = fixedRoute.steps.find((s) => s.id === 'arrange')!
    expect(resolveBody(arrange, oneBase)).toBe('tutorials.fixedRoute.arrange.body')
  })

  it('completes the bases step once the second base exists', () => {
    const thin = { game: createMockGame({ enforceBaseOrder: true }), ackedSteps: new Set(['unlock-trigger']), bases: [{ id: 'b1' }] as never }
    expect(advance(fixedRoute, makeTourState(thin), NO_CLICKS, null)).toBe('add-bases')
    expect(advance(fixedRoute, makeTourState({ ...thin, bases: TWO_BASES }), NO_CLICKS, null)).toBe('arrange')
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
    for (const step of fixedRoute.steps) step.prepare?.(actions, makeTourState({ mode: 'build' }))
    expect(setMode).not.toHaveBeenCalled()
  })
})

describe('fixed-route advance()', () => {
  const cases: Array<{ name: string; state: TourStateOverrides; from: string | null; expectId: string | null }> = [
    { name: 'order off → enable-order', state: { bases: TWO_BASES, game: createMockGame({ enforceBaseOrder: false }) }, from: null, expectId: 'enable-order' },
    { name: 'order on → unlock-trigger', state: { bases: TWO_BASES, game: createMockGame({ enforceBaseOrder: true }) }, from: null, expectId: 'unlock-trigger' },
    {
      name: 'unlock-trigger acked → arrange',
      state: { bases: TWO_BASES, game: createMockGame({ enforceBaseOrder: true }), ackedSteps: new Set(['unlock-trigger']) },
      from: null,
      expectId: 'arrange',
    },
    {
      name: 'route editor present → route',
      state: {
        bases: TWO_BASES,
        game: createMockGame({ enforceBaseOrder: true }),
        ackedSteps: new Set(['unlock-trigger']),
        fields: { 'base-route-editor': { present: true } },
      },
      from: null,
      expectId: 'route',
    },
    {
      name: 'route acked → readiness',
      state: {
        bases: TWO_BASES,
        game: createMockGame({ enforceBaseOrder: true }),
        ackedSteps: new Set(['unlock-trigger', 'route']),
        fields: { 'base-route-editor': { present: true } },
      },
      from: null,
      expectId: 'readiness',
    },
    {
      name: 'everything acked → finished',
      state: {
        bases: TWO_BASES,
        game: createMockGame({ enforceBaseOrder: true }),
        ackedSteps: new Set(['unlock-trigger', 'route', 'readiness']),
        fields: { 'base-route-editor': { present: true } },
      },
      from: null,
      expectId: null,
    },
    {
      name: 'an unread explanation is never skipped, even from a later position',
      state: { bases: TWO_BASES, game: createMockGame({ enforceBaseOrder: true }), fields: { 'base-route-editor': { present: true } } },
      from: 'unlock-trigger',
      expectId: 'unlock-trigger',
    },
  ]

  it.each(cases)('$name', ({ state, from, expectId }) => {
    expect(advance(fixedRoute, makeTourState(state), NO_CLICKS, from)).toBe(expectId)
  })
})
