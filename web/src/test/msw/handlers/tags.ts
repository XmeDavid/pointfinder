import { http, HttpResponse } from 'msw'
import { createMockTag } from '../../factories/tag'

export const tagsHandlers = [
  http.get('/api/games/:gameId/tags', () => {
    return HttpResponse.json([
      createMockTag({ id: 'tag-1', label: 'Important' }),
      createMockTag({ id: 'tag-2', label: 'Outdoor' }),
    ])
  }),

  http.post('/api/games/:gameId/tags', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId } = params
    return HttpResponse.json(
      createMockTag({
        id: `tag-new-${Date.now()}`,
        gameId: gameId as string,
        label: (body.label as string) ?? 'New Tag',
        color: (body.color as string) ?? '#3b82f6',
      }),
      { status: 201 },
    )
  }),

  http.patch('/api/games/:gameId/tags/:tagId', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { gameId, tagId } = params
    return HttpResponse.json(
      createMockTag({
        id: tagId as string,
        gameId: gameId as string,
        label: (body.label as string) ?? 'Updated Tag',
        color: (body.color as string) ?? '#3b82f6',
      }),
    )
  }),

  http.delete('/api/games/:gameId/tags/:tagId', () => {
    return new HttpResponse(null, { status: 204 })
  }),
]
