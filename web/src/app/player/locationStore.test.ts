import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as geolocation from '@/platform/geolocation'
import { refreshLocationWatch, setArrivalDwell, startLocationStore, useLocationStore } from './locationStore'

type Handlers = {
  onPosition: (p: geolocation.LocationPosition) => void
  onState: (s: geolocation.LocationState) => void
}

let handlers: Handlers | null = null
let stop: ReturnType<typeof vi.fn>

function position(lat: number, lng: number, accuracy = 9, timestamp = 1_000): geolocation.LocationPosition {
  return { coords: { latitude: lat, longitude: lng, accuracy, heading: 42 }, timestamp }
}

beforeEach(() => {
  handlers = null
  stop = vi.fn()
  vi.spyOn(geolocation, 'watchLocation').mockImplementation(async (onPosition, onState) => {
    handlers = { onPosition, onState } as Handlers
    return stop
  })
  useLocationStore.setState({ fix: null, heading: null, status: 'idle', claimable: {}, dwell: {} })
})

afterEach(() => vi.restoreAllMocks())

describe('locationStore', () => {
  it('publishes fixes, heading and status while the game is live', async () => {
    const enabled = { value: true }
    const off = startLocationStore(() => enabled.value)
    await vi.waitFor(() => expect(handlers).not.toBeNull())

    handlers!.onState('watching')
    handlers!.onPosition(position(40.09, -8.87))

    expect(useLocationStore.getState().status).toBe('watching')
    expect(useLocationStore.getState().fix).toEqual({ lat: 40.09, lng: -8.87, accuracy: 9, capturedAt: 1_000 })
    expect(useLocationStore.getState().heading).toBe(42)
    off()
  })

  it('does not start a watch while the game is not live', async () => {
    const off = startLocationStore(() => false)
    await Promise.resolve()
    expect(geolocation.watchLocation).not.toHaveBeenCalled()
    off()
  })

  it('starts and stops as enablement changes on refresh', async () => {
    const enabled = { value: false }
    const off = startLocationStore(() => enabled.value)
    await Promise.resolve()
    expect(geolocation.watchLocation).not.toHaveBeenCalled()

    enabled.value = true
    refreshLocationWatch()
    await vi.waitFor(() => expect(geolocation.watchLocation).toHaveBeenCalledOnce())

    enabled.value = false
    refreshLocationWatch()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
    expect(useLocationStore.getState().status).toBe('idle')
    off()
  })

  it('stops the watch and clears arrival state on teardown', async () => {
    const off = startLocationStore(() => true)
    await vi.waitFor(() => expect(handlers).not.toBeNull())
    setArrivalDwell({ b1: [{ lat: 1, lng: 2, accuracy: 5, capturedAt: 10 }] }, { b1: true })
    expect(useLocationStore.getState().claimable).toEqual({ b1: true })

    off()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
    expect(useLocationStore.getState().claimable).toEqual({})
    expect(useLocationStore.getState().dwell).toEqual({})
  })
})
