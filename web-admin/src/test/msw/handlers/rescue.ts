import { http, HttpResponse } from 'msw'
import { createMockSubmission } from '../../factories/submission'

export const rescueHandlers = [
  http.post('/api/games/:gameId/teams/:teamId/check-in/:baseId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/games/:gameId/teams/:teamId/bases/:baseId/mark-completed', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(
      createMockSubmission({
        id: `sub-completed-${Date.now()}`,
        status: 'approved',
        points: (body.pointsOverride as number) ?? 10,
      }),
      { status: 201 },
    )
  }),

  http.post('/api/games/:gameId/teams/:teamId/bases/:baseId/unlock-override', ({ params }) => {
    const { gameId, teamId, baseId } = params
    return HttpResponse.json(
      {
        id: `override-${Date.now()}`,
        gameId: gameId as string,
        teamId: teamId as string,
        baseId: baseId as string,
        createdByOperatorId: 'operator-1',
        createdByDisplayName: 'Test Operator',
        reason: null,
        createdAt: new Date().toISOString(),
      },
      { status: 201 },
    )
  }),

  http.delete('/api/games/:gameId/teams/:teamId/bases/:baseId/unlock-override', () => {
    return new HttpResponse(null, { status: 204 })
  }),
]
