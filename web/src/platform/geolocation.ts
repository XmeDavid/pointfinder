import { isNative } from './runtime'
import { isForeground, onAppVisibility } from './lifecycle'
export type LocationState = 'idle' | 'requesting' | 'watching' | 'denied' | 'unavailable'
export interface LocationPosition { coords: { latitude: number; longitude: number; accuracy: number; heading: number | null }; timestamp: number }

/** Foreground-only tracking. Pause frees the native watch; resume rechecks permissions. */
export async function watchLocation(onPosition: (position: LocationPosition) => void, onState: (state: LocationState) => void): Promise<() => void> {
  let alive = true
  let generation = 0
  let stopWatch: (() => void) | undefined
  let asked = false
  const pause = () => { generation++; stopWatch?.(); stopWatch = undefined }
  const start = async () => {
    pause()
    if (!alive || !isForeground()) return
    const current = generation
    const active = () => alive && current === generation && isForeground()
    onState('requesting')
    try {
      if (isNative()) {
        const geo = await import('@tauri-apps/plugin-geolocation')
        if (!active()) return
        let permission = await geo.checkPermissions()
        if (!active()) return
        if (permission.location !== 'granted' && permission.location !== 'denied' && !asked) {
          asked = true
          permission = await geo.requestPermissions(['location'])
        }
        if (!active()) return
        // Android approximate location is still useful; accuracy accompanies every fix.
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') { onState('denied'); return }
        const id = await geo.watchPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 }, (position, error) => {
          if (!active()) return
          if (position) { onState('watching'); onPosition(position) }
          else if (error) onState('unavailable')
        })
        const stop = () => { void geo.clearWatch(id).catch(() => {}) }
        if (!active()) stop()
        else { stopWatch = stop; onState('watching') }
      } else {
        if (!navigator.geolocation) { onState('unavailable'); return }
        const id = navigator.geolocation.watchPosition((position) => {
          if (active()) { onState('watching'); onPosition(position) }
        }, (error) => { if (active()) onState(error.code === 1 ? 'denied' : 'unavailable') }, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 })
        stopWatch = () => navigator.geolocation.clearWatch(id)
      }
    } catch { if (active()) onState('unavailable') }
  }
  const off = onAppVisibility((active) => {
    if (active) void start()
    else { pause(); if (alive) onState('idle') }
  })
  // Return cleanup immediately, including while the permission sheet is open.
  void start()
  return () => { alive = false; off(); pause() }
}
