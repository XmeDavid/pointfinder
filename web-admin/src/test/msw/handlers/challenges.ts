import { http, HttpResponse } from 'msw'
import { createMockChallenge } from '../../factories/challenge'

export const challengesHandlers = [
  http.get('/api/games/:gameId/challenges', () => {
    return HttpResponse.json([
      createMockChallenge({ id: 'challenge-1', title: 'Challenge Alpha' }),
      createMockChallenge({ id: 'challenge-2', title: 'Challenge Beta' }),
      createMockChallenge({ id: 'challenge-3', title: 'Challenge Gamma' }),
    ])
  }),

  http.post('/api/games/:gameId/challenges', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId } = params
    return HttpResponse.json(
      createMockChallenge({
        id: `challenge-new-${Date.now()}`,
        gameId: gameId as string,
        title: (body.title as string) ?? 'New Challenge',
        description: (body.description as string) ?? '',
        content: (body.content as string) ?? '',
        completionContent: (body.completionContent as string) ?? '',
        answerType: (body.answerType as 'text' | 'file' | 'none') ?? 'text',
        autoValidate: (body.autoValidate as boolean) ?? false,
        points: (body.points as number) ?? 10,
        locationBound: (body.locationBound as boolean) ?? false,
      }),
      { status: 201 },
    )
  }),

  http.put('/api/games/:gameId/challenges/:challengeId', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId, challengeId } = params
    return HttpResponse.json(
      createMockChallenge({
        id: challengeId as string,
        gameId: gameId as string,
        title: (body.title as string) ?? 'Updated Challenge',
        ...body,
      } as Partial<import('@/types').Challenge>),
    )
  }),

  http.delete('/api/games/:gameId/challenges/:challengeId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch('/api/games/:gameId/challenges/reorder', () => {
    return new HttpResponse(null, { status: 200 })
  }),
]
