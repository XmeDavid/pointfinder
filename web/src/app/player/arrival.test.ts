import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { QueryClient } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { memoryPlatform } from '@/features/player/test/renderPlayer'
import { createServices, type AppServices } from './client'
import { useLocationStore } from './locationStore'
import { clearArrivalNotices, getArrivalNotices } from './arrivalNotices'
import { startArrivalDetector } from './arrival'

const BASE = { id: 'b1', gameId: 'g1', lat: 40.09, lng: -8.87, nfcLinked: false, hidden: false, fixedChallengeId: null, checkInMethod: 'LOCATION', checkInRadiusM: 20 }
const HIDDEN = { id: 'h1', gameId: 'g1', lat: 41.09, lng: -8.87, nfcLinked: false, hidden: true, fixedChallengeId: null, checkInMethod: 'LOCATION', checkInRadiusM: 20 }
const PROGRESS = { baseId: 'b1', challengeTitle: 'The old mill', lat: 40.09, lng: -8.87, nfcLinked: false, status: 'not_visited', checkedInAt: null, challengeId: 'c1', submissionStatus: null, checkInMethod: 'LOCATION', checkInRadiusM: 20 }

function seed(queries: QueryClient, bases: unknown[], progress: unknown[]) {
  queries.setQueryData(['gameData', 'g1'], { gameStatus: 'live', unlockTrigger: 'CHECK_IN', bases, challenges: [], assignments: [], progress })
  queries.setQueryData(['snapshot', 'g1'], { stateVersion: 1, game: { id: 'g1', name: 'Serra', status: 'live' }, team: { id: 'team1', name: 'Falcons', memberCount: 2 }, progress, submissions: [], uploadSessions: [] })
}

let services: AppServices
let queries: QueryClient

beforeEach(async () => {
  services = await createServices(await memoryPlatform())
  // Seeded data has no observers; a zero gc time would drop it between fixes.
  queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })
  clearArrivalNotices()
})

afterEach(() => {
  queries.clear()
  vi.restoreAllMocks()
})

describe('startArrivalDetector', () => {
  it('checks in once when a fix lands inside the radius and announces the base', async () => {
    const posted: string[] = []
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
      posted.push(String(params.baseId))
      const body = (await request.json()) as { method?: string; claimed?: boolean }
      expect(body.method).toBe('geo')
      expect(body.claimed).toBe(false)
      return HttpResponse.json({ checkInId: 'ci-1', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
    }))
    seed(queries, [BASE], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await vi.waitFor(() => expect(posted).toEqual(['b1']))
    await vi.waitFor(() => expect(getArrivalNotices()).toMatchObject([{ baseId: 'b1', title: 'The old mill', state: 'synced', hidden: false }]))

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() + 1_000 } })
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(posted).toEqual(['b1'])
    off()
  })

  it('queues the proof offline and reports the queued state', async () => {
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', () => HttpResponse.error()))
    seed(queries, [BASE], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await vi.waitFor(async () => expect(await services.queue.list()).toMatchObject([{ type: 'check_in', baseId: 'b1', state: 'pending' }]))
    await vi.waitFor(() => expect(getArrivalNotices()).toMatchObject([{ baseId: 'b1', state: 'queued' }]))
    off()
  })

  it('discards an out-of-range refusal instead of leaving a failed action', async () => {
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', () => HttpResponse.json(
      { code: 'CHECK_IN_OUT_OF_RANGE', message: 'Too far', errors: { distanceM: '84', allowedM: '20' } },
      { status: 400 },
    )))
    seed(queries, [BASE], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await new Promise((resolve) => setTimeout(resolve, 80))
    await vi.waitFor(async () => expect(await services.queue.list()).toEqual([]))
    off()
  })

  it('never fires for a base the team already visited', async () => {
    const posted = vi.fn()
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', () => { posted(); return HttpResponse.json({ checkInId: 'x', baseId: 'b1', checkedInAt: '2026-09-05T10:45:00Z' }) }))
    seed(queries, [BASE], [{ ...PROGRESS, status: 'checked_in', checkedInAt: '2026-09-05T09:00:00Z' }])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(posted).not.toHaveBeenCalled()
    off()
  })

  it('finds a hidden geofence base the map never showed', async () => {
    const posted: string[] = []
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', ({ params }) => {
      posted.push(String(params.baseId))
      return HttpResponse.json({ checkInId: 'ci-h', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z' })
    }))
    seed(queries, [BASE, HIDDEN], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    useLocationStore.setState({ fix: { lat: 41.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    await vi.waitFor(() => expect(posted).toEqual(['h1']))
    off()
  })

  it('publishes dwell buffers and claimability for the base screen', async () => {
    server.use(http.post('/api/player/games/:gameId/bases/:baseId/check-in', () => HttpResponse.json(
      { code: 'CHECK_IN_OUT_OF_RANGE', message: 'Too far', errors: { distanceM: '60', allowedM: '20' } },
      { status: 400 },
    )))
    seed(queries, [BASE], [PROGRESS])
    const off = startArrivalDetector(services, queries)

    // Inside the wide ring (max(3*20, 50) = 60 m) but too coarse to auto-accept.
    // Fixes land one at a time, as a phone delivers them; each becomes a sample.
    const start = Date.now()
    for (let i = 0; i < 4; i++) {
      useLocationStore.setState({ fix: { lat: 40.0904, lng: -8.87, accuracy: 80, capturedAt: start + i * 11_000 } })
      await vi.waitFor(() => expect(useLocationStore.getState().dwell.b1?.length ?? 0).toBe(i + 1))
    }
    expect(useLocationStore.getState().claimable.b1).toBeUndefined()
    // A minute inside the ring with a fresh last sample makes the base claimable.
    useLocationStore.setState({ fix: { lat: 40.0904, lng: -8.87, accuracy: 80, capturedAt: start + 70_000 } })
    await vi.waitFor(() => expect(useLocationStore.getState().dwell.b1?.length ?? 0).toBe(5))
    vi.useFakeTimers({ now: start + 75_000, toFake: ['Date'] })
    useLocationStore.setState({ fix: { lat: 40.0904, lng: -8.87, accuracy: 80, capturedAt: start + 81_000 } })
    vi.useRealTimers()
    await vi.waitFor(() => expect(useLocationStore.getState().claimable.b1).toBe(true))
    off()
  })
})
