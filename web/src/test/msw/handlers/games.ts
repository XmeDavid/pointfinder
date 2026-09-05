import { http, HttpResponse } from 'msw'
import { createMockGame } from '../../factories/game'
import type { GameStatus } from '@/types'

export const gamesHandlers = [
  http.get('/api/games', () => {
    return HttpResponse.json([
      createMockGame({ id: 'game-1', name: 'Test Game 1' }),
      createMockGame({ id: 'game-2', name: 'Test Game 2', status: 'live' }),
    ])
  }),

  http.get('/api/games/:id', ({ params }) => {
    const { id } = params
    if (id === 'not-found') {
      return HttpResponse.json(
        { message: 'Game not found' },
        { status: 404 },
      )
    }
    return HttpResponse.json(
      createMockGame({ id: id as string, name: `Game ${id}` }),
    )
  }),

  http.post('/api/games', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(
      createMockGame({
        id: `game-new-${Date.now()}`,
        name: (body.name as string) ?? 'New Game',
        description: (body.description as string) ?? '',
        status: 'setup',
      }),
      { status: 201 },
    )
  }),

  http.put('/api/games/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { id } = params
    return HttpResponse.json(
      createMockGame({
        id: id as string,
        name: (body.name as string) ?? `Game ${id}`,
        ...body,
      } as Partial<import('@/types').Game>),
    )
  }),

  http.delete('/api/games/:id', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch('/api/games/:id/status', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { id } = params
    return HttpResponse.json(
      createMockGame({
        id: id as string,
        name: `Game ${id}`,
        status: (body.status as GameStatus) ?? 'live',
      }),
    )
  }),

  http.post('/api/games/import', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const gameData = body.gameData as Record<string, unknown> | undefined
    const game = gameData?.game as Record<string, unknown> | undefined
    return HttpResponse.json(
      createMockGame({
        id: `game-imported-${Date.now()}`,
        name: (game?.name as string) ?? 'Imported Game',
        description: (game?.description as string) ?? '',
        status: 'setup',
      }),
      { status: 201 },
    )
  }),
]
