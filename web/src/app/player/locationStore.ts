import { create } from 'zustand'
import type { Fix } from '@pointfinder/game-core'
import { watchLocation, type LocationPosition, type LocationState } from '@/platform/geolocation'

/** Kept identical to the value `useTeamLocation` published before the store existed. */
export type LocationStatus = LocationState

export interface PlayerLocationState {
  fix: Fix | null
  heading: number | null
  status: LocationStatus
  /** Bases whose dwell buffer currently satisfies the claim rule. Written by the arrival detector. */
  claimable: Record<string, boolean>
  /** Dwell buffers per location base, sent as `dwell` with a claimed proof. */
  dwell: Record<string, Fix[]>
}

const EMPTY: PlayerLocationState = { fix: null, heading: null, status: 'idle', claimable: {}, dwell: {} }

/**
 * One foreground location watch for the whole player app. The map, the position
 * reporter and the arrival detector all read from here, so the phone runs a
 * single native watch no matter how many screens are mounted.
 */
export const useLocationStore = create<PlayerLocationState>(() => ({ ...EMPTY }))

export function setArrivalDwell(dwell: Record<string, Fix[]>, claimable: Record<string, boolean>): void {
  useLocationStore.setState({ dwell, claimable })
}

let controller: { enabled: () => boolean; stop?: () => void; alive: boolean; running: boolean; generation: number } | null = null

function toFix(position: LocationPosition): Fix {
  return { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: position.timestamp }
}

async function evaluate(): Promise<void> {
  const active = controller
  if (!active || !active.alive) return
  const want = active.enabled()
  if (want === active.running) return
  active.running = want
  const generation = ++active.generation
  if (!want) {
    active.stop?.()
    active.stop = undefined
    useLocationStore.setState({ status: 'idle' })
    return
  }
  try {
    const off = await watchLocation(
      (position) => {
        if (!active.alive || active.generation !== generation) return
        useLocationStore.setState({ fix: toFix(position), heading: position.coords.heading })
      },
      (state) => {
        if (!active.alive || active.generation !== generation) return
        useLocationStore.setState({ status: state })
      },
    )
    if (!active.alive || active.generation !== generation) off()
    else active.stop = off
  } catch {
    if (active.alive && active.generation === generation) useLocationStore.setState({ status: 'unavailable' })
  }
}

/** Re-read `enabled()` and start or stop the native watch accordingly. */
export function refreshLocationWatch(): void {
  void evaluate()
}

/**
 * Own the foreground watch for as long as the runtime lives. `enabled` is read on
 * start and on every `refreshLocationWatch()`, so the caller decides what "the game
 * is live" means without this module knowing about sessions or queries.
 */
export function startLocationStore(enabled: () => boolean): () => void {
  controller?.stop?.()
  const active = { enabled, stop: undefined as (() => void) | undefined, alive: true, running: false, generation: 0 }
  controller = active
  void evaluate()
  return () => {
    active.alive = false
    active.generation++
    active.stop?.()
    active.stop = undefined
    if (controller === active) controller = null
    useLocationStore.setState({ ...EMPTY })
  }
}
