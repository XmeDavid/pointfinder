import { http, HttpResponse } from 'msw'
import type { TutorialProgress, TutorialStatus } from '@/features/tutorials/types'
import type { Game } from '@/types/game'
import { createMockGame } from '../../factories/game'

const KNOWN_SCENARIOS = ['first-game', 'fixed-route', 'exploration']
const KNOWN_STATUSES: TutorialStatus[] = ['in_progress', 'completed', 'skipped']

interface RecordedPut {
  scenarioId: string
  body: { status: string; currentStep: string | null; gameId: string | null }
}

let rows: TutorialProgress[] = []
let puts: RecordedPut[] = []
let practiceGames: Game[] = []

/**
 * In-memory stand-in for `user_tutorial_progress`, shaped so tests can both
 * seed a starting state and assert exactly which writes went out.
 */
export const tutorialProgressStore = {
  reset(): void {
    rows = []
    puts = []
    practiceGames = []
  },
  seed(next: TutorialProgress[]): void {
    rows = next.map((row) => ({ ...row }))
  },
  rows(): TutorialProgress[] {
    return rows.map((row) => ({ ...row }))
  },
  /** Practice games created through the practice endpoint, in order. */
  practiceGames(): Game[] {
    return practiceGames.map((game) => ({ ...game }))
  },
  puts(): RecordedPut[] {
    return puts.map((entry) => ({ ...entry, body: { ...entry.body } }))
  },
}

export const tutorialsHandlers = [
  http.get('/api/users/me/tutorials', () => HttpResponse.json(tutorialProgressStore.rows())),

  http.post('/api/users/me/tutorials/:scenarioId/practice-game', async ({ params, request }) => {
    const scenarioId = String(params.scenarioId)
    const body = (await request.json()) as { name: string }
    const game: Game = {
      ...createMockGame({ id: `practice-${scenarioId}`, name: body.name, status: 'setup' }),
      tutorialScenario: scenarioId,
      tutorialExpiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    }
    practiceGames.push(game)
    rows = [
      ...rows.filter((row) => row.scenarioId !== scenarioId),
      { scenarioId: scenarioId as TutorialProgress['scenarioId'], status: 'in_progress', currentStep: null, gameId: game.id, startedAt: new Date().toISOString(), completedAt: null },
    ]
    return HttpResponse.json(game, { status: 201 })
  }),

  http.put('/api/users/me/tutorials/:scenarioId', async ({ params, request }) => {
    const scenarioId = params.scenarioId as string
    const body = (await request.json()) as {
      status?: string
      currentStep?: string | null
      gameId?: string | null
    }

    puts.push({
      scenarioId,
      body: {
        status: body.status ?? '',
        currentStep: body.currentStep ?? null,
        gameId: body.gameId ?? null,
      },
    })

    if (!KNOWN_SCENARIOS.includes(scenarioId)) {
      return HttpResponse.json(
        { message: 'Unknown tutorial scenario', code: 'TUTORIAL_SCENARIO_UNKNOWN' },
        { status: 400 },
      )
    }
    if (!KNOWN_STATUSES.includes(body.status as TutorialStatus)) {
      return HttpResponse.json(
        { message: 'Unknown tutorial status', code: 'TUTORIAL_STATUS_UNKNOWN' },
        { status: 400 },
      )
    }

    const status = body.status as TutorialStatus
    const now = new Date().toISOString()
    const existing = rows.find((row) => row.scenarioId === scenarioId)
    const restarting = status === 'in_progress' && (body.currentStep ?? null) === null

    const next: TutorialProgress = {
      scenarioId: scenarioId as TutorialProgress['scenarioId'],
      status,
      currentStep: body.currentStep ?? null,
      gameId: body.gameId ?? null,
      startedAt: existing && !restarting ? existing.startedAt : now,
      completedAt: status === 'completed' ? now : null,
    }

    rows = existing
      ? rows.map((row) => (row.scenarioId === scenarioId ? next : row))
      : [...rows, next]

    return HttpResponse.json(next)
  }),
]
