import type { BaseProgress, RouteStatus } from '@pointfinder/api'
import type { PendingAction } from './queue'

/** Key of a base's route: its stage id, or this for bases without a stage. */
export const DEFAULT_ROUTE = 'default'

export interface RouteFrontier {
  enabled: boolean
  /** Undefined means route authority is unavailable, null means every base was checked in. */
  nextRequiredBaseNumber: number | null | undefined
  provisionalCheckInIds: string[]
}

export interface BaseRoute extends RouteFrontier {
  /** One frontier per route, keyed by stage id or DEFAULT_ROUTE. Absent on a bare single-route frontier. */
  scopes?: Record<string, RouteFrontier>
}

export function routeKey(base: { stageId?: string | null } | undefined): string {
  return base?.stageId ?? DEFAULT_ROUTE
}

/** Advance only through actual check-ins or a contiguous chain of pending tag proofs.
 * Never infer route progression from challenge completion or the set of visible bases.
 */
function frontier(enabled: boolean, authority: number | null | undefined, rows: BaseProgress[], pending: PendingAction[]): RouteFrontier {
  let next = authority
  const ids: string[] = []
  if (enabled && typeof next === 'number') {
    for (;;) {
      const base = rows.find((p) => p.sequenceNumber === next)
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
  if (typeof next === 'number' && next !== authority && !rows.some((p) => typeof p.sequenceNumber === 'number' && p.sequenceNumber >= next!)) next = undefined
  return { enabled, nextRequiredBaseNumber: next, provisionalCheckInIds: ids }
}

/**
 * Routes of a game as the phone knows them. A server that reports `routes`
 * gets one frontier per route (a stage, or the default route); an older
 * server's single `enforceBaseOrder` / `nextRequiredBaseNumber` pair is one
 * default route spanning every numbered base. The top-level fields describe
 * the first enforced route that still has a next base, for one-line notices.
 */
export function baseRoute(
  game: { enforceBaseOrder?: boolean; nextRequiredBaseNumber?: number | null; routes?: RouteStatus[] } | undefined,
  progress: BaseProgress[],
  pending: PendingAction[],
): BaseRoute {
  const scopes: Record<string, RouteFrontier> = {}
  if (game?.routes && game.routes.length > 0) {
    for (const r of game.routes) {
      const key = r.stageId ?? DEFAULT_ROUTE
      scopes[key] = frontier(r.enforceBaseOrder, r.nextRequiredBaseNumber, progress.filter((p) => routeKey(p) === key), pending)
    }
  } else {
    scopes[DEFAULT_ROUTE] = frontier(game?.enforceBaseOrder === true, game?.nextRequiredBaseNumber, progress, pending)
  }
  const enforced = Object.values(scopes).filter((s) => s.enabled)
  const lead = enforced.find((s) => s.nextRequiredBaseNumber !== null) ?? enforced[0]
  const ids = enforced.flatMap((s) => s.provisionalCheckInIds)
  return {
    enabled: enforced.length > 0,
    nextRequiredBaseNumber: lead ? lead.nextRequiredBaseNumber : (enforced.length > 0 ? null : undefined),
    provisionalCheckInIds: ids,
    scopes,
  }
}

/** Null means this scan is allowed by available authority. Undefined requires a refresh. */
export function missingPreviousBase(route: BaseRoute, base: BaseProgress | undefined): number | null | undefined {
  // Legacy single-route callers may pass a frontier without scopes.
  const scope = route.scopes?.[routeKey(base)] ?? (route.scopes && Object.keys(route.scopes).length > 0 ? undefined : route)
  if (!scope || !scope.enabled || base?.checkedInAt || scope.nextRequiredBaseNumber === null) return null
  if (typeof base?.sequenceNumber !== 'number' || scope.nextRequiredBaseNumber === undefined) return undefined
  return base.sequenceNumber > scope.nextRequiredBaseNumber ? scope.nextRequiredBaseNumber : null
}
