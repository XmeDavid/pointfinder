import { describe, expect, it, vi } from 'vitest'
import { resources, keyPaths } from '@pointfinder/i18n'
import { createMockBase } from '@/test/factories/base'
import { createMockChallenge } from '@/test/factories/challenge'
import { createMockTeam } from '@/test/factories/team'
import { isKnownAnchor } from '../anchors'
import { advance, resolveAnchor } from '../engine'
import { makeTourState, type TourStateOverrides } from '../testState'
import type { TourActions } from '../types'
import { variableOutcome } from './variableOutcome'

const actions = {
  setMode: vi.fn(), openDrawer: vi.fn(), closeDrawer: vi.fn(), selectBase: vi.fn(), selectChallenge: vi.fn(), selectTeam: vi.fn(),
  setReadinessExpanded: vi.fn(), setSettingsPanelOpen: vi.fn(), navigate: vi.fn(),
} as unknown as TourActions
const NO_CLICKS: ReadonlySet<string> = new Set<string>()

const mill = createMockBase({ id: 'mill', name: 'Old mill', fixedChallengeId: 'c1' })
const chapel = createMockBase({ id: 'chapel', name: 'Chapel steps' })
const c1 = createMockChallenge({ id: 'c1', title: 'Count the arches', fixedBaseId: 'mill' })
const c2 = createMockChallenge({ id: 'c2', title: 'Photograph the bell' })
const falcons = createMockTeam({ id: 'falcons', name: 'Falcons' })
const lions = createMockTeam({ id: 'lions', name: 'Lions' })
const seeded: TourStateOverrides = { bases: [mill, chapel], challenges: [c1, c2], teams: [falcons, lions], mode: 'build', selectedChallengeId: 'c1', ackedSteps: new Set(['intro']) }
const valueFields = { 'variable-value-next-falcons': { present: true, value: 'the chapel' }, 'variable-value-next-lions': { present: true, value: 'the lookout' } }

describe('variable-outcome scenario', () => {
  it('is a practice-game scenario with its steps in order', () => {
    expect(variableOutcome.entry).toBe('practice-game')
    expect(variableOutcome.steps.map((s) => s.id)).toEqual(['intro', 'open-challenge', 'variable-key', 'variable-add', 'variable-values', 'variable-save', 'completion', 'challenge-save', 'finish'])
  })

  it('anchors only known ids and opens the pinned challenge', () => {
    const state = makeTourState(seeded)
    for (const step of variableOutcome.steps) {
      const anchor = resolveAnchor(step, state)
      if (anchor === '') continue
      expect(isKnownAnchor(anchor), `${step.id} anchor ${anchor}`).toBe(true)
    }
    expect(resolveAnchor(variableOutcome.steps[1], makeTourState({ ...seeded, selectedChallengeId: null }))).toBe('challenge-item-c1')
    expect(resolveAnchor(variableOutcome.steps[4], state)).toBe('variable-value-next-falcons')
  })

  it.each(['en', 'pt', 'de'] as const)('has every copy key in %s', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    for (const step of variableOutcome.steps) {
      expect(paths.has(step.copy.title), `${step.id} title`).toBe(true)
      expect(paths.has(step.copy.body), `${step.id} body`).toBe(true)
    }
  })

  it('prepares only UI state and keeps build mode', () => {
    for (const step of variableOutcome.steps) step.prepare?.(actions, makeTourState(seeded))
    expect(actions.setMode).not.toHaveBeenCalled()
  })

  const cases: Array<{ name: string; state: TourStateOverrides; expectId: string | null }> = [
    { name: 'challenge open → name the variable', state: seeded, expectId: 'variable-key' },
    { name: 'key typed → add it', state: { ...seeded, fields: { 'variable-key-input': { present: true, value: 'next' } } }, expectId: 'variable-add' },
    { name: 'added → values', state: { ...seeded, fields: { 'variable-value-next-falcons': { present: true, value: '' }, 'variable-value-next-lions': { present: true, value: '' } } }, expectId: 'variable-values' },
    { name: 'one team still empty stays on values', state: { ...seeded, fields: { 'variable-value-next-falcons': { present: true, value: 'the chapel' }, 'variable-value-next-lions': { present: true, value: '' } } }, expectId: 'variable-values' },
    { name: 'all values → save them', state: { ...seeded, fields: valueFields }, expectId: 'variable-save' },
    { name: 'saved → completion text', state: { ...seeded, fields: valueFields, stepCompletedAt: { 'variable-values': 100 }, lastSuccess: { 'variables:challenge': 200 } }, expectId: 'completion' },
    { name: 'placeholder typed → save the challenge', state: { ...seeded, fields: { ...valueFields, 'completion-content': { present: true, value: 'Good work — go to next.' } }, stepCompletedAt: { 'variable-values': 100, completion: 300 }, lastSuccess: { 'variables:challenge': 200 } }, expectId: 'challenge-save' },
    { name: 'challenge saved → finish', state: { ...seeded, fields: { ...valueFields, 'completion-content': { present: true, value: 'go to next' } }, stepCompletedAt: { 'variable-values': 100, completion: 300 }, lastSuccess: { 'variables:challenge': 200, 'challenge:update': 400 } }, expectId: 'finish' },
  ]
  it.each(cases)('$name', ({ state, expectId }) => {
    expect(advance(variableOutcome, makeTourState(state), NO_CLICKS, null)).toBe(expectId)
  })
})
