import { http, HttpResponse } from 'msw'
import { createMockAssignment } from '../../factories/assignment'

export const assignmentsHandlers = [
  http.get('/api/games/:gameId/assignments', () => {
    return HttpResponse.json([
      createMockAssignment({ id: 'assignment-1', baseId: 'base-1', challengeId: 'challenge-1' }),
      createMockAssignment({ id: 'assignment-2', baseId: 'base-2', challengeId: 'challenge-2' }),
    ])
  }),

  http.put('/api/games/:gameId/assignments', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId } = params
    const assignments = (body.assignments as Array<Record<string, unknown>>) ?? []
    return HttpResponse.json(
      assignments.map((a, i) =>
        createMockAssignment({
          id: `assignment-bulk-${i + 1}`,
          gameId: gameId as string,
          baseId: a.baseId as string,
          challengeId: a.challengeId as string,
          teamId: a.teamId as string | undefined,
        }),
      ),
    )
  }),

  http.delete('/api/games/:gameId/assignments/:assignmentId', () => {
    return new HttpResponse(null, { status: 204 })
  }),
]
