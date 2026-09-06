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
  it('starts clean and records the bound game, the games snapshot and the start time', () => {
    const before = Date.now()
    useTourStore.getState().start('first-game', { gameId: 'game-7', gamesAtStart: ['g-old-1', 'g-old-2'] })
    const state = useTourStore.getState()

    expect(state.activeScenario).toBe('first-game')
    expect(state.gameId).toBe('game-7')
    expect(state.gamesAtStart).toEqual(['g-old-1', 'g-old-2'])
    expect(state.currentStepId).toBeNull()
    expect(state.paused).toBe(false)
    expect(state.startedAt).toBeGreaterThanOrEqual(before)
    expect(state.ackedSteps.size).toBe(0)
    expect(state.laterSteps.size).toBe(0)
    expect(state.clickedSteps.size).toBe(0)
  })

  it('can start at a named step for Resume', () => {
    useTourStore.getState().start('first-game', { stepId: 'go-live' })
    expect(useTourStore.getState().currentStepId).toBe('go-live')
  })

  it('start clears the leftovers of a previous run', () => {
    const s = useTourStore.getState()
    s.start('first-game', { gamesAtStart: ['g1'] })
    s.ack('orient')
    s.clicked('base-qr')
    s.setCurrentStep('base-name')
    s.markStepCompleted('orient', 123)

    useTourStore.getState().start('first-game')
    const state = useTourStore.getState()
    expect(state.currentStepId).toBeNull()
    expect(state.gamesAtStart).toEqual([])
    expect(state.ackedSteps.size).toBe(0)
    expect(state.clickedSteps.size).toBe(0)
    expect(state.stepCompletedAt).toEqual({})
  })

  it('pauses and resumes without losing the position', () => {
    const s = useTourStore.getState()
    s.start('first-game')
    s.setCurrentStep('base-name')
    s.pause()
    expect(useTourStore.getState().paused).toBe(true)
    useTourStore.getState().resume()
    expect(useTourStore.getState().paused).toBe(false)
    expect(useTourStore.getState().currentStepId).toBe('base-name')
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

  it('complete records a completed row for the active scenario and ends the run', () => {
    const s = useTourStore.getState()
    s.setProgress([
      { scenarioId: 'first-game', status: 'in_progress', currentStep: 'orient', gameId: null, startedAt: '2026-09-06T10:00:00Z', completedAt: null },
    ])
    s.start('first-game', { gameId: 'g1' })
    s.setCurrentStep('finish')
    useTourStore.getState().complete()

    const state = useTourStore.getState()
    expect(state.activeScenario).toBeNull()
    const row = state.progress['first-game']
    expect(row?.status).toBe('completed')
    expect(row?.currentStep).toBe('finish')
    expect(row?.gameId).toBe('g1')
    expect(row?.startedAt).toBe('2026-09-06T10:00:00Z')
    expect(row?.completedAt).toBeTruthy()
  })

  it('complete without a run is a no-op on progress', () => {
    useTourStore.getState().complete()
    expect(useTourStore.getState().progress).toEqual({})
  })

  it('skip records a skipped row without touching an active run', () => {
    const s = useTourStore.getState()
    s.start('fixed-route', { gameId: 'g1' })
    useTourStore.getState().skip('first-game')

    const state = useTourStore.getState()
    expect(state.progress['first-game']?.status).toBe('skipped')
    expect(state.progress['first-game']?.currentStep).toBeNull()
    expect(state.activeScenario).toBe('fixed-route')
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
    s.start('first-game', { gamesAtStart: ['g1'] })
    s.ack('orient')
    s.recordSuccess('game:status', 1)
    useTourStore.getState().reset()

    const state = useTourStore.getState()
    expect(state.activeScenario).toBeNull()
    expect(state.gamesAtStart).toEqual([])
    expect(state.lastSuccess).toEqual({})
    expect(state.tick).toBe(0)
    expect(state.progress).toEqual({})
  })
})

describe('scenario registry', () => {
  it('is empty until a scenario registers itself', () => {
    expect(scenarioList()).toEqual([])
    expect(getScenario('fixed-route')).toBeUndefined()

    registerScenario(probe)
    expect(getScenario('fixed-route')).toBe(probe)
    expect(scenarioList()).toEqual([probe])
  })
})
