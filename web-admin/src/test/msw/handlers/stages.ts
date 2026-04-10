import { http, HttpResponse } from 'msw'
import { createMockStage } from '../../factories/stage'

export const stagesHandlers = [
  http.get('/api/games/:gameId/stages', () => {
    return HttpResponse.json([
      createMockStage({ id: 'stage-1', name: 'Stage 1', isActive: true }),
      createMockStage({ id: 'stage-2', name: 'Stage 2', isActive: false }),
    ])
  }),

  http.post('/api/games/:gameId/stages', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId } = params
    return HttpResponse.json(
      createMockStage({
        id: `stage-new-${Date.now()}`,
        gameId: gameId as string,
        name: (body.name as string) ?? 'New Stage',
        description: (body.description as string | null) ?? null,
        transitionType: (body.transitionType as 'scheduled' | 'trigger' | 'manual') ?? 'manual',
        scheduledAt: (body.scheduledAt as string | null) ?? null,
        triggerBaseId: (body.triggerBaseId as string | null) ?? null,
        baseIds: (body.baseIds as string[]) ?? [],
      }),
      { status: 201 },
    )
  }),

  http.put('/api/games/:gameId/stages/:stageId', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId, stageId } = params
    return HttpResponse.json(
      createMockStage({
        id: stageId as string,
        gameId: gameId as string,
        name: (body.name as string) ?? 'Updated Stage',
        description: (body.description as string | null) ?? null,
        transitionType: (body.transitionType as 'scheduled' | 'trigger' | 'manual') ?? 'manual',
      }),
    )
  }),

  http.delete('/api/games/:gameId/stages/:stageId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch('/api/games/:gameId/stages/reorder', () => {
    return new HttpResponse(null, { status: 200 })
  }),
]
