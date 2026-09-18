import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapRef } from 'react-map-gl/maplibre'
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('@/platform', () => ({ kv: storage }))
vi.mock('@/platform/runtime', () => ({ isNative: () => true }))
import { useMapCamera } from './useMapCamera'

const camera = { longitude: 8.5, latitude: 47.3, zoom: 16, bearing: 30, pitch: 20 }
function mapRef() {
  return { current: { jumpTo: vi.fn(), getCenter: () => ({ lng: 8.5, lat: 47.3 }), getZoom: () => 16, getBearing: () => 30, getPitch: () => 20 } as unknown as MapRef }
}
beforeEach(() => {
  vi.resetAllMocks()
  storage.get.mockResolvedValue(JSON.stringify(camera))
  storage.set.mockResolvedValue(undefined)
})
describe('native map recovery', () => {
  it('restores the saved camera for the supplied identity/game', async () => {
    const ref = mapRef()
    const { result } = renderHook(() => useMapCamera(ref, 'operator:u:g'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.hasCamera).toBe(true)
    expect(storage.get).toHaveBeenCalledWith('map-camera:operator:u:g')
    expect(ref.current.jumpTo).toHaveBeenCalledWith({ center: [8.5, 47.3], zoom: 16, bearing: 30, pitch: 20 })
    act(() => result.current.onMoveEnd())
    await waitFor(() => expect(storage.set).toHaveBeenCalledWith('map-camera:operator:u:g', JSON.stringify(camera)))
  })
  it('preserves a new gesture made while storage is loading', async () => {
    let finish!: (value: string) => void
    storage.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const ref = mapRef()
    const { result } = renderHook(() => useMapCamera(ref, 'player:p:g'))
    act(() => result.current.onMoveStart({ originalEvent: {} }))
    await act(async () => { finish(JSON.stringify(camera)) })
    expect(ref.current.jumpTo).not.toHaveBeenCalled()
    expect(result.current.hasCamera).toBe(true)
  })
  it('falls back to normal map framing for malformed stored coordinates', async () => {
    storage.get.mockResolvedValue(JSON.stringify({ ...camera, latitude: 999 }))
    const ref = mapRef()
    const { result } = renderHook(() => useMapCamera(ref, 'operator:u:g'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.hasCamera).toBe(false)
    expect(ref.current.jumpTo).not.toHaveBeenCalled()
  })
})
