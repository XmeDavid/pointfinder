import { describe, expect, it, vi } from 'vitest'
import { resources, keyPaths } from '@pointfinder/i18n'
import { createMockBase } from '@/test/factories/base'
import { createMockChallenge } from '@/test/factories/challenge'
import { createMockTeam } from '@/test/factories/team'
import { isKnownAnchor } from '../anchors'
import { advance, resolveAnchor } from '../engine'
import { makeTourState, type TourStateOverrides } from '../testState'
import type { TourActions } from '../types'
import { differentPath } from './differentPath'

const actions = {
  setMode: vi.fn(), openDrawer: vi.fn(), closeDrawer: vi.fn(), selectBase: vi.fn(), selectChallenge: vi.fn(), selectTeam: vi.fn(),
  setReadinessExpanded: vi.fn(), setSettingsPanelOpen: vi.fn(), navigate: vi.fn(),
} as unknown as TourActions
const NO_CLICKS: ReadonlySet<string> = new Set<string>()

const A = createMockBase({ id: 'A', name: 'Base A · Old mill' })
const B = createMockBase({ id: 'B', name: 'Base B · Chapel steps' })
const C = createMockBase({ id: 'C', name: 'Base C · Lookout' })
const c1 = createMockChallenge({ id: 'c1', title: '1 · Count the arches' })
const c2 = createMockChallenge({ id: 'c2', title: '2 · Photograph the bell' })
const c3 = createMockChallenge({ id: 'c3', title: '3 · Name the peak' })
const falcons = createMockTeam({ id: 'falcons', name: 'Falcons' })
const lions = createMockTeam({ id: 'lions', name: 'Lions' })
const seeded: TourStateOverrides = { bases: [A, B, C], challenges: [c1, c2, c3], teams: [falcons, lions], mode: 'build' }
const row = (baseId: string, challengeId: string, teamId: string) => ({ id: `${baseId}${challengeId}${teamId}`, gameId: 'g', baseId, challengeId, teamId })
const falconsRows = [row('A', 'c1', 'falcons'), row('B', 'c2', 'falcons'), row('C', 'c3', 'falcons')]
const lionsRows = [row('C', 'c1', 'lions'), row('B', 'c2', 'lions'), row('A', 'c3', 'lions')]

describe('different-path scenario', () => {
  it('is a practice-game scenario with its steps in order', () => {
    expect(differentPath.entry).toBe('practice-game')
    expect(differentPath.steps.map((s) => s.id)).toEqual(['intro', 'open-grid', 'falcons', 'lions', 'briefing', 'finish'])
  })

  it('anchors only known ids, resolved against the seeded game', () => {
    const state = makeTourState(seeded)
    for (const step of differentPath.steps) {
      const anchor = resolveAnchor(step, state)
      if (anchor === '') continue
      expect(isKnownAnchor(anchor), `${step.id} anchor ${anchor}`).toBe(true)
    }
    // Without the cells in the DOM (a phone's base list) the marks point at the base rows.
    expect(resolveAnchor(differentPath.steps[2], state)).toBe('assignment-base-A')
    expect(resolveAnchor(differentPath.steps[3], state)).toBe('assignment-base-C')
    const desktop = makeTourState({
      ...seeded,
      fields: { 'assignment-cell-A-falcons': { present: true, value: '' }, 'assignment-cell-C-lions': { present: true, value: '' } },
    })
    expect(resolveAnchor(differentPath.steps[2], desktop)).toBe('assignment-cell-A-falcons')
    expect(resolveAnchor(differentPath.steps[3], desktop)).toBe('assignment-cell-C-lions')
    // Once base A is set for the Falcons, the mark moves down the route to base B.
    const oneDown = makeTourState({ ...seeded, assignments: [row('A', 'c1', 'falcons')] })
    expect(resolveAnchor(differentPath.steps[2], oneDown)).toBe('assignment-base-B')
  })

  it.each(['en', 'pt', 'de'] as const)('has every copy key in %s', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    expect(paths.has(differentPath.title)).toBe(true)
    for (const step of differentPath.steps) {
      expect(paths.has(step.copy.title), `${step.id} title`).toBe(true)
      expect(paths.has(step.copy.body), `${step.id} body`).toBe(true)
    }
  })

  it('prepares only UI state and keeps build mode', () => {
    for (const step of differentPath.steps) step.prepare?.(actions, makeTourState(seeded))
    expect(actions.setMode).not.toHaveBeenCalled()
  })

  const cases: Array<{ name: string; state: TourStateOverrides; expectId: string | null }> = [
    { name: 'intro acked → open the grid', state: { ...seeded, ackedSteps: new Set(['intro']) }, expectId: 'open-grid' },
    { name: 'grid open → falcons', state: { ...seeded, ackedSteps: new Set(['intro']), fields: { 'assignment-grid': { present: true } } }, expectId: 'falcons' },
    { name: 'falcons half done stays on falcons', state: { ...seeded, ackedSteps: new Set(['intro']), fields: { 'assignment-grid': { present: true } }, assignments: falconsRows.slice(0, 2) }, expectId: 'falcons' },
    { name: 'falcons done → lions', state: { ...seeded, ackedSteps: new Set(['intro']), fields: { 'assignment-grid': { present: true } }, assignments: falconsRows }, expectId: 'lions' },
    { name: 'both routes done → briefing', state: { ...seeded, ackedSteps: new Set(['intro']), fields: { 'assignment-grid': { present: true } }, assignments: [...falconsRows, ...lionsRows] }, expectId: 'briefing' },
    { name: 'a wrong order for lions is not done', state: { ...seeded, ackedSteps: new Set(['intro']), fields: { 'assignment-grid': { present: true } }, assignments: [...falconsRows, row('A', 'c1', 'lions'), row('B', 'c2', 'lions'), row('C', 'c3', 'lions')] }, expectId: 'lions' },
  ]
  it.each(cases)('$name', ({ state, expectId }) => {
    expect(advance(differentPath, makeTourState(state), NO_CLICKS, null)).toBe(expectId)
  })
})
