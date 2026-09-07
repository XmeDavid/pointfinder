import { describe, expect, it } from 'vitest'
import { createMockGame } from '@/test/factories/game'
import { activePracticeGame, isPracticeGame, practiceHoursLeft } from './practiceGame'

describe('practice game helpers', () => {
  it('recognises a practice game by its scenario marker', () => {
    expect(isPracticeGame({ tutorialScenario: 'fixed-route' })).toBe(true)
    expect(isPracticeGame({ tutorialScenario: null })).toBe(false)
    expect(isPracticeGame(createMockGame())).toBe(false)
    expect(isPracticeGame(null)).toBe(false)
  })

  it('counts whole hours left and never goes below zero', () => {
    const now = Date.parse('2026-09-07T10:00:00Z')
    expect(practiceHoursLeft('2026-09-08T09:30:00Z', now)).toBe(24)
    expect(practiceHoursLeft('2026-09-07T10:20:00Z', now)).toBe(1)
    expect(practiceHoursLeft('2026-09-07T09:00:00Z', now)).toBe(0)
    expect(practiceHoursLeft(null, now)).toBe(0)
  })

  it('finds the one practice game that has not ended', () => {
    const games = [
      createMockGame({ id: 'real' }),
      { ...createMockGame({ id: 'old', status: 'ended' }), tutorialScenario: 'exploration' },
      { ...createMockGame({ id: 'current', status: 'setup' }), tutorialScenario: 'fixed-route' },
    ]
    expect(activePracticeGame(games)?.id).toBe('current')
    expect(activePracticeGame(undefined)).toBeUndefined()
  })
})
