import type { Base, BaseProgress } from '@pointfinder/api'
import { baseRoute, missingPreviousBase, type ArrivalCandidate, type PendingAction } from '@pointfinder/game-core'

/** Server default when a base row carries no resolved radius (older cached game data). */
const FALLBACK_RADIUS_M = 15

export type ArrivalBaseRow = Pick<Base, 'id' | 'lat' | 'lng' | 'hidden' | 'checkInMethod' | 'checkInRadiusM'>

export interface CandidateInput {
  bases: ArrivalBaseRow[]
  progress: BaseProgress[]
  pending: PendingAction[]
  game: { enforceBaseOrder?: boolean; nextRequiredBaseNumber?: number | null } | undefined
}

/**
 * Location bases the detector may still fire for: not visited, no proof already in
 * flight, and not blocked by the enforced route. Hidden geofence rows are included
 * so an unlisted base can still be found, but only when the route allows it.
 */
export function buildCandidates({ bases, progress, pending, game }: CandidateInput): ArrivalCandidate[] {
  const route = baseRoute(game, progress, pending)
  const byBase = new Map(progress.map((p) => [p.baseId, p]))
  const claimed = new Set(pending.filter((a) => a.type === 'check_in' && a.state !== 'failed').map((a) => a.baseId))
  const candidates: ArrivalCandidate[] = []
  for (const b of bases) {
    if (b.checkInMethod !== 'LOCATION') continue
    if (claimed.has(b.id)) continue
    const row = byBase.get(b.id)
    if (row?.checkedInAt || (row && row.status !== 'not_visited')) continue
    // null means the route allows this base now; a number or undefined means it does not.
    if (missingPreviousBase(route, row) !== null) continue
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) continue
    const radiusM = typeof b.checkInRadiusM === 'number' && b.checkInRadiusM > 0 ? b.checkInRadiusM : FALLBACK_RADIUS_M
    candidates.push({ baseId: b.id, lat: b.lat, lng: b.lng, radiusM, hidden: b.hidden === true })
  }
  return candidates
}
