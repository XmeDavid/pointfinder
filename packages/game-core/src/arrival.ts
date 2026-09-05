import { DWELL_BUFFER_MAX_MS, autoAccepts, dwellSatisfied, insideWideRing, pushDwellSample } from './geofence'
import type { Fix } from './location'

/**
 * The arrival detector: pure, so the runtime can feed it real fixes and a
 * test can feed it a walk made of numbers.
 *
 * Each fix answers two questions. Which unvisited location bases has the
 * team just reached, and at which of them has it now stood long enough to
 * claim presence when the chip refuses to converge? The caller keeps the
 * returned state; attempts are recorded in it, so a caller that drops the
 * state will retry, and one that keeps it will not.
 */

export interface ArrivalCandidate {
  baseId: string
  lat: number
  lng: number
  radiusM: number
  /** Hidden bases are detected like any other; only their name is withheld. */
  hidden: boolean
}

export interface ArrivalState {
  /** Epoch ms of the last enqueued attempt, per base. */
  attemptedAt: Record<string, number>
  /** Dwell buffer per base, kept only while the team is inside the wider ring. */
  dwell: Record<string, Fix[]>
}

/** One attempt per base per half minute: a refused proof must not become a loop. */
export const ARRIVAL_RETRY_MS = 30_000

export function emptyArrivalState(): ArrivalState {
  return { attemptedAt: {}, dwell: {} }
}

export interface ArrivalEvaluation {
  state: ArrivalState
  /** Bases whose proof should be enqueued now. */
  fire: ArrivalCandidate[]
  /** Base ids where "I'm here" may be offered. */
  claimable: string[]
}

export function evaluateArrival(fix: Fix, candidates: ArrivalCandidate[], state: ArrivalState, now: number): ArrivalEvaluation {
  // Attempts only matter inside the retry window; forget the rest so the map never grows.
  const attemptedAt: Record<string, number> = Object.fromEntries(
    Object.entries(state.attemptedAt).filter(([, at]) => now - at < ARRIVAL_RETRY_MS),
  )
  // A base missing from this evaluation (a snapshot refetch, a transient route
  // block) keeps its buffer while the samples are still fresh, so the team does
  // not have to stand still for another full minute when it reappears.
  const present = new Set(candidates.map((c) => c.baseId))
  const dwell: Record<string, Fix[]> = Object.fromEntries(
    Object.entries(state.dwell).filter(([baseId, buffer]) => {
      const last = buffer[buffer.length - 1]
      return !present.has(baseId) && last !== undefined && now - last.capturedAt <= DWELL_BUFFER_MAX_MS
    }),
  )
  const fire: ArrivalCandidate[] = []
  const claimable: string[] = []
  for (const candidate of candidates) {
    let buffer: Fix[] = []
    if (insideWideRing(fix, candidate, candidate.radiusM)) {
      buffer = pushDwellSample(state.dwell[candidate.baseId] ?? [], fix)
      dwell[candidate.baseId] = buffer
    }
    const last = attemptedAt[candidate.baseId]
    if (autoAccepts(fix, candidate, candidate.radiusM).ok && (last === undefined || now - last >= ARRIVAL_RETRY_MS)) {
      attemptedAt[candidate.baseId] = now
      fire.push(candidate)
    }
    if (dwellSatisfied(buffer, now)) claimable.push(candidate.baseId)
  }
  return { state: { attemptedAt, dwell }, fire, claimable }
}
