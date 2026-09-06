import { beforeEach, describe, expect, it } from 'vitest'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { tutorialsApi } from './tutorials'

describe('tutorialsApi', () => {
  beforeEach(() => {
    tutorialProgressStore.reset()
  })

  it('lists an empty progress set for a fresh operator', async () => {
    await expect(tutorialsApi.list()).resolves.toEqual([])
  })

  it('upserts a row and returns it, then lists it back', async () => {
    const row = await tutorialsApi.update('first-game', {
      status: 'in_progress',
      currentStep: 'place-base',
    })

    expect(row.scenarioId).toBe('first-game')
    expect(row.status).toBe('in_progress')
    expect(row.currentStep).toBe('place-base')
    expect(row.completedAt).toBeNull()

    await expect(tutorialsApi.list()).resolves.toEqual([row])
  })

  it('sends currentStep and gameId explicitly, defaulting gameId to null', async () => {
    await tutorialsApi.update('first-game', { status: 'in_progress', currentStep: null })

    expect(tutorialProgressStore.puts()).toEqual([
      {
        scenarioId: 'first-game',
        body: { status: 'in_progress', currentStep: null, gameId: null },
      },
    ])
  })

  it('carries a gameId through for setup-game scenarios', async () => {
    const row = await tutorialsApi.update('fixed-route', {
      status: 'in_progress',
      currentStep: 'arrange',
      gameId: 'game-7',
    })

    expect(row.gameId).toBe('game-7')
  })

  it('stamps completedAt when the status is completed', async () => {
    const row = await tutorialsApi.update('first-game', { status: 'completed', currentStep: 'finish' })

    expect(row.status).toBe('completed')
    expect(row.completedAt).not.toBeNull()
  })

  it('rejects an unknown scenario id with the server error code', async () => {
    await expect(
      // @ts-expect-error deliberately outside ScenarioId to mimic a stale client
      tutorialsApi.update('not-a-tutorial', { status: 'in_progress', currentStep: null }),
    ).rejects.toMatchObject({ response: { status: 400 } })
  })
})
