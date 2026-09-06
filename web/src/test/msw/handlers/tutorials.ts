import { http, HttpResponse } from 'msw'
import type { TutorialProgress, TutorialStatus } from '@/features/tutorials/types'

const KNOWN_SCENARIOS = ['first-game', 'fixed-route', 'exploration']
const KNOWN_STATUSES: TutorialStatus[] = ['in_progress', 'completed', 'skipped']

interface RecordedPut {
  scenarioId: string
  body: { status: string; currentStep: string | null; gameId: string | null }
}

let rows: TutorialProgress[] = []
let puts: RecordedPut[] = []

/**
 * In-memory stand-in for `user_tutorial_progress`, shaped so tests can both
 * seed a starting state and assert exactly which writes went out.
 */
export const tutorialProgressStore = {
  reset(): void {
    rows = []
    puts = []
  },
  seed(next: TutorialProgress[]): void {
    rows = next.map((row) => ({ ...row }))
  },
  rows(): TutorialProgress[] {
    return rows.map((row) => ({ ...row }))
  },
  puts(): RecordedPut[] {
    return puts.map((entry) => ({ ...entry, body: { ...entry.body } }))
  },
}

export const tutorialsHandlers = [
  http.get('/api/users/me/tutorials', () => HttpResponse.json(tutorialProgressStore.rows())),

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
