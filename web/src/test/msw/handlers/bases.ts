import { http, HttpResponse } from 'msw'
import { createMockBase } from '../../factories/base'

export const basesHandlers = [
  http.get('/api/games/:gameId/bases', () => {
    return HttpResponse.json([
      createMockBase({ id: 'base-1', name: 'Base Alpha' }),
      createMockBase({ id: 'base-2', name: 'Base Beta' }),
      createMockBase({ id: 'base-3', name: 'Base Gamma' }),
    ])
  }),

  http.post('/api/games/:gameId/bases', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId } = params
    return HttpResponse.json(
      createMockBase({
        id: `base-new-${Date.now()}`,
        gameId: gameId as string,
        name: (body.name as string) ?? 'New Base',
        description: (body.description as string) ?? '',
        lat: (body.lat as number) ?? 0,
        lng: (body.lng as number) ?? 0,
        hidden: (body.hidden as boolean) ?? false,
      }),
      { status: 201 },
    )
  }),

  http.put('/api/games/:gameId/bases/:baseId', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId, baseId } = params
    return HttpResponse.json(
      createMockBase({
        id: baseId as string,
        gameId: gameId as string,
        name: (body.name as string) ?? 'Updated Base',
        ...body,
      } as Partial<import('@/types/base').Base>),
    )
  }),

  http.delete('/api/games/:gameId/bases/:baseId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch('/api/games/:gameId/bases/reorder', () => {
    return new HttpResponse(null, { status: 200 })
  }),
]
