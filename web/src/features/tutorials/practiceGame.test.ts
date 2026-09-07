import { describe, expect, it } from 'vitest'
import { createMockGame } from '@/test/factories/game'
import { afterEach, vi } from 'vitest'
import { activePracticeGame, isPracticeGame, practiceHoursLeft, readPracticeCentre } from './practiceGame'

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

describe('readPracticeCentre', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the position when geolocation answers', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: 41.15, longitude: -8.61 } }),
      },
    })
    await expect(readPracticeCentre()).resolves.toEqual({ lat: 41.15, lng: -8.61 })
  })

  it('gives up quietly when geolocation is denied, missing, or slow', async () => {
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => fail(new Error('denied')) },
    })
    await expect(readPracticeCentre()).resolves.toBeUndefined()
    vi.stubGlobal('navigator', {})
    await expect(readPracticeCentre()).resolves.toBeUndefined()
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: () => {} } })
    await expect(readPracticeCentre(20)).resolves.toBeUndefined()
  })
})
})
