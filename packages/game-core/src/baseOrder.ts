import type { BaseProgress } from '@pointfinder/api'
import type { PendingAction } from './queue'

export interface BaseRoute {
  enabled: boolean
  /** Undefined means route authority is unavailable, null means every base was checked in. */
  nextRequiredBaseNumber: number | null | undefined
  provisionalCheckInIds: string[]
}

/** Advance only through actual check-ins or a contiguous chain of pending tag proofs.
 * Never infer route progression from challenge completion or the set of visible bases.
 */
export function baseRoute(
  game: { enforceBaseOrder?: boolean; nextRequiredBaseNumber?: number | null } | undefined,
  progress: BaseProgress[],
  pending: PendingAction[],
): BaseRoute {
  let next = game?.nextRequiredBaseNumber
  const ids: string[] = []
  if (game?.enforceBaseOrder && typeof next === 'number') {
    for (;;) {
      const base = progress.find((p) => p.sequenceNumber === next)
      // A missing visible base may be hidden: the frontier must stop there.
      if (!base) break
      if (base.checkedInAt) { next++; continue }
      const proof = pending.find((a) => a.type === 'check_in' && a.baseId === base.baseId && a.state !== 'failed' && !a.prerequisiteCheckInIds?.some((id) => pending.some((p) => p.id === id && p.state === 'failed')))
      if (!proof) break
      ids.push(proof.id)
      next++
    }
  }
  // A locally accepted or pending final visible check-in cannot tell us whether
  // the route is complete or another hidden base follows. Keep an initial
  // canonical hidden frontier, but do not invent a number beyond the visible tail.
  if (typeof next === 'number' && next !== game?.nextRequiredBaseNumber && !progress.some((p) => typeof p.sequenceNumber === 'number' && p.sequenceNumber >= next!)) next = undefined
  return { enabled: game?.enforceBaseOrder === true, nextRequiredBaseNumber: next, provisionalCheckInIds: ids }
}

/** Null means this scan is allowed by available authority. Undefined requires a refresh. */
export function missingPreviousBase(route: BaseRoute, base: BaseProgress | undefined): number | null | undefined {
  if (!route.enabled || base?.checkedInAt || route.nextRequiredBaseNumber === null) return null
  if (typeof base?.sequenceNumber !== 'number' || route.nextRequiredBaseNumber === undefined) return undefined
  return base.sequenceNumber > route.nextRequiredBaseNumber ? route.nextRequiredBaseNumber : null
}
