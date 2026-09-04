/**
 * Location policy for player tracking.
 *
 * The chip gives fixes; this decides which are worth sending and how the
 * operator side should read them. Pure functions so both ends agree.
 */

export interface Fix {
  lat: number
  lng: number
  /** Horizontal accuracy in metres. */
  accuracy: number
  /** Epoch ms when the fix was taken. */
  capturedAt: number
}

export interface SendPolicy {
  /** Reject fixes worse than this. */
  maxAccuracyM: number
  /** Reject fixes older than this when it is time to send. */
  maxAgeMs: number
  /** Send at least this often while a fresh fix exists. */
  heartbeatMs: number
  /** Send sooner than the heartbeat when the player moved at least this far. */
  moveThresholdM: number
  /** Never send more often than this. */
  minIntervalMs: number
}

export const DEFAULT_SEND_POLICY: SendPolicy = {
  maxAccuracyM: 50,
  maxAgeMs: 20_000,
  heartbeatMs: 30_000,
  moveThresholdM: 15,
  minIntervalMs: 5_000,
}

export type SendDecision = { send: true; reason: 'first' | 'moved' | 'heartbeat' } | { send: false; reason: 'inaccurate' | 'stale' | 'too_soon' | 'unchanged' }

/** Decide whether `fix` should go to the server now, given what was last sent. */
export function decideSend(fix: Fix, lastSent: Fix | null, lastSentAt: number | null, now: number, policy: SendPolicy = DEFAULT_SEND_POLICY): SendDecision {
  if (!(fix.accuracy > 0) || fix.accuracy > policy.maxAccuracyM) return { send: false, reason: 'inaccurate' }
  if (now - fix.capturedAt > policy.maxAgeMs) return { send: false, reason: 'stale' }
  if (!lastSent || lastSentAt === null) return { send: true, reason: 'first' }
  const since = now - lastSentAt
  if (since < policy.minIntervalMs) return { send: false, reason: 'too_soon' }
  if (distanceM(fix, lastSent) >= policy.moveThresholdM) return { send: true, reason: 'moved' }
  if (since >= policy.heartbeatMs) return { send: true, reason: 'heartbeat' }
  return { send: false, reason: 'unchanged' }
}

export type Freshness = 'live' | 'aging' | 'stale'

/** How the operator map should treat a position updated at `updatedAt`. */
export function freshness(updatedAtIso: string, now: number, agingAfterMs = 90_000, staleAfterMs = 5 * 60_000): Freshness {
  const t = Date.parse(updatedAtIso)
  if (Number.isNaN(t)) return 'stale'
  const age = now - t
  if (age >= staleAfterMs) return 'stale'
  if (age >= agingAfterMs) return 'aging'
  return 'live'
}

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Pick one representative position per team: the freshest accurate fix wins. */
export function representativePerTeam<T extends { teamId: string; updatedAt: string; accuracy?: number | null }>(positions: T[]): Map<string, T> {
  const best = new Map<string, T>()
  for (const p of positions) {
    const cur = best.get(p.teamId)
    if (!cur) {
      best.set(p.teamId, p)
      continue
    }
    const newer = Date.parse(p.updatedAt) > Date.parse(cur.updatedAt)
    if (newer) best.set(p.teamId, p)
  }
  return best
}
