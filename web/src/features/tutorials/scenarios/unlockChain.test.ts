import { describe, expect, it, vi } from 'vitest'
import { resources, keyPaths } from '@pointfinder/i18n'
import { createMockBase } from '@/test/factories/base'
import { createMockChallenge } from '@/test/factories/challenge'
import { isKnownAnchor } from '../anchors'
import { advance, effectiveSteps, resolveAnchor } from '../engine'
import { makeTourState, type TourStateOverrides } from '../testState'
import type { TourActions } from '../types'
import { unlockChain } from './unlockChain'

const actions = {
  setMode: vi.fn(), openDrawer: vi.fn(), closeDrawer: vi.fn(), selectBase: vi.fn(), selectChallenge: vi.fn(), selectTeam: vi.fn(),
  setReadinessExpanded: vi.fn(), setSettingsPanelOpen: vi.fn(), navigate: vi.fn(),
} as unknown as TourActions
const NO_CLICKS: ReadonlySet<string> = new Set<string>()

const trailhead = createMockBase({ id: 'b-trail', name: 'Trailhead', fixedChallengeId: 'c1' })
const bridge = createMockBase({ id: 'b-bridge', name: 'Old bridge', hidden: true, fixedChallengeId: 'c2' })
const tower = createMockBase({ id: 'b-tower', name: 'Ruined tower', hidden: true, fixedChallengeId: 'c3' })
const c1 = createMockChallenge({ id: 'c1', title: 'Read the trail sign', fixedBaseId: 'b-trail', unlocksBaseIds: [] })
const c2 = createMockChallenge({ id: 'c2', title: 'Count the bridge arches', fixedBaseId: 'b-bridge', unlocksBaseIds: ['b-tower'] })
const c3 = createMockChallenge({ id: 'c3', title: 'Sketch the tower', fixedBaseId: 'b-tower' })
const seeded: TourStateOverrides = { bases: [trailhead, bridge, tower], challenges: [c1, c2, c3], mode: 'build' }

describe('unlock-chain scenario', () => {
  it('is a practice-game scenario with its steps in order', () => {
    expect(unlockChain.entry).toBe('practice-game')
    expect(unlockChain.steps.map((s) => s.id)).toEqual(['intro', 'open-first', 'reveal', 'save-reveal', 'fork', 'bonus', 'finish'])
  })

  it('anchors only known ids, resolved against the seeded game', () => {
    const state = makeTourState(seeded)
    for (const step of unlockChain.steps) {
      const anchor = resolveAnchor(step, state)
      if (anchor === '') continue
      expect(isKnownAnchor(anchor), `${step.id} anchor ${anchor}`).toBe(true)
    }
    expect(resolveAnchor(unlockChain.steps[1], state)).toBe('challenge-item-c1')
    expect(resolveAnchor(unlockChain.steps[2], state)).toBe('unlocks-base-b-bridge')
  })

  it.each(['en', 'pt', 'de'] as const)('has every copy key in %s', (lang) => {
    const paths = new Set(keyPaths(resources[lang].translation as Record<string, unknown>))
    expect(paths.has(unlockChain.title)).toBe(true)
    expect(paths.has(unlockChain.blurb)).toBe(true)
    for (const step of unlockChain.steps) {
      expect(paths.has(step.copy.title), `${step.id} title`).toBe(true)
      expect(paths.has(step.copy.body), `${step.id} body`).toBe(true)
    }
  })

  it('prepares only UI state and keeps build mode', () => {
    for (const step of unlockChain.steps) step.prepare?.(actions, makeTourState(seeded))
    expect(actions.setMode).not.toHaveBeenCalled()
  })

  const cases: Array<{ name: string; state: TourStateOverrides; expectId: string | null }> = [
    { name: 'starts with the intro', state: seeded, expectId: 'intro' },
    { name: 'intro acked → open the trailhead challenge', state: { ...seeded, ackedSteps: new Set(['intro']) }, expectId: 'open-first' },
    { name: 'challenge open → reveal', state: { ...seeded, ackedSteps: new Set(['intro']), selectedChallengeId: 'c1' }, expectId: 'reveal' },
    { name: 'bridge toggled → save', state: { ...seeded, ackedSteps: new Set(['intro']), selectedChallengeId: 'c1', fields: { 'unlocks-base-b-bridge': { present: true, pressed: true } } }, expectId: 'save-reveal' },
    { name: 'saved link → fork', state: { ...seeded, challenges: [{ ...c1, unlocksBaseIds: ['b-bridge'] }, c2, c3], ackedSteps: new Set(['intro']), selectedChallengeId: 'c1', fields: { 'unlocks-base-b-bridge': { present: true, pressed: true } } }, expectId: 'fork' },
    { name: 'everything acked → finished', state: { ...seeded, challenges: [{ ...c1, unlocksBaseIds: ['b-bridge'] }, c2, c3], selectedChallengeId: 'c1', fields: { 'unlocks-base-b-bridge': { present: true, pressed: true } }, ackedSteps: new Set(['intro', 'fork', 'bonus', 'finish']) }, expectId: null },
  ]
  it.each(cases)('$name', ({ state, expectId }) => {
    expect(advance(unlockChain, makeTourState(state), NO_CLICKS, null)).toBe(expectId)
  })

  it('keeps every step when nothing is guarded', () => {
    expect(effectiveSteps(unlockChain, makeTourState(seeded))).toHaveLength(unlockChain.steps.length)
  })
})
