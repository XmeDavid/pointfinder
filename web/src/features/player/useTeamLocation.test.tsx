import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { ServicesProvider } from '@/app/player/services'
import { createServices } from '@/app/player/client'
import { memoryPlatform } from '@/features/player/test/renderPlayer'
import { useLocationStore } from '@/app/player/locationStore'
import { useTeamLocation } from './useTeamLocation'
import * as geolocation from '@/platform/geolocation'

async function wrapper() {
  const services = await createServices(await memoryPlatform())
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServicesProvider services={services}>{children}</ServicesProvider>
    </QueryClientProvider>
  )
}

describe('useTeamLocation', () => {
  // The services provider starts the player runtime, which owns the real watch;
  // jsdom has no geolocation, so keep that watch inert here.
  beforeEach(() => {
    vi.spyOn(geolocation, 'watchLocation').mockResolvedValue(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('reports store fixes to the operators and republishes the store state', async () => {
    const sent: Array<Record<string, unknown>> = []
    server.use(http.post('/api/player/games/:gameId/location', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return new HttpResponse(null, { status: 204 })
    }))
    useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })

    const { result } = renderHook(() => useTeamLocation('g1', true), { wrapper: await wrapper() })
    act(() => useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() }, heading: 12 }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ lat: 40.09, lng: -8.87, accuracy: 8 })
    expect(result.current.status).toBe('watching')
    expect(result.current.heading).toBe(12)
  })

  it('sends nothing while the game is not live', async () => {
    const sent = vi.fn()
    server.use(http.post('/api/player/games/:gameId/location', () => { sent(); return new HttpResponse(null, { status: 204 }) }))
    useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })

    renderHook(() => useTeamLocation('g1', false), { wrapper: await wrapper() })
    act(() => useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 8, capturedAt: Date.now() } }))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).not.toHaveBeenCalled()
  })

  it('drops fixes the send policy rejects', async () => {
    const sent = vi.fn()
    server.use(http.post('/api/player/games/:gameId/location', () => { sent(); return new HttpResponse(null, { status: 204 }) }))
    useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })

    renderHook(() => useTeamLocation('g1', true), { wrapper: await wrapper() })
    act(() => useLocationStore.setState({ fix: { lat: 40.09, lng: -8.87, accuracy: 500, capturedAt: Date.now() } }))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).not.toHaveBeenCalled()
  })
})
