import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { basesApi } from './bases'

describe('basesApi check-in fields', () => {
  it('sends the method and radius when creating a base', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.post('/api/games/:gameId/bases', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(createMockBase({ id: 'base-new' }), { status: 201 })
      }),
    )

    await basesApi.create({
      gameId: 'game-1',
      name: 'Old mill',
      description: '',
      lat: 38.7,
      lng: -9.1,
      checkInMethod: 'LOCATION',
      checkInRadiusM: 40,
    })

    expect(body.checkInMethod).toBe('LOCATION')
    expect(body.checkInRadiusM).toBe(40)
    expect(body.gameId).toBeUndefined()
  })

  it('sends a null radius when the base should inherit the game default', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.put('/api/games/:gameId/bases/:baseId', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(createMockBase({ id: 'base-1' }))
      }),
    )

    await basesApi.update('base-1', {
      gameId: 'game-1',
      checkInMethod: 'QR',
      checkInRadiusM: null,
    })

    expect(body.checkInMethod).toBe('QR')
    expect(body.checkInRadiusM).toBeNull()
  })

  it('defaults mock bases to the NFC method', () => {
    expect(createMockBase().checkInMethod).toBe('NFC')
    expect(createMockBase().checkInRadiusM).toBeNull()
  })
})
