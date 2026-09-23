import type { Base, Game } from '@/types'
import type { Stage } from '@/types/stage'

/** Route key of the bases without a stage. */
export const DEFAULT_ROUTE_KEY = 'default'

/**
 * One base route as the builder shows it (OW-40): each stage is its own
 * route, numbered from 1 with its own order setting, and the bases without a
 * stage form the default route governed by the game's setting.
 */
export interface BaseRouteGroup {
  key: string
  /** Null for the default route. */
  stageId: string | null
  /** The stage's name; null for the default route. */
  name: string | null
  enforced: boolean
  /** In route order: the server's base order kept within this route. */
  bases: Base[]
}

/**
 * Whether any route of the game is enforced. With the stages at hand this is
 * derived locally, so a stage toggle shows at once; otherwise it is the
 * server's `routeOrderEnforced`, falling back to the game's own flag on older
 * servers.
 */
export function anyRouteEnforced(
  game: Pick<Game, 'enforceBaseOrder' | 'routeOrderEnforced'> | undefined,
  stages: Pick<Stage, 'enforceBaseOrder'>[] | undefined,
): boolean {
  if (!game) return false
  if (stages) return Boolean(game.enforceBaseOrder) || stages.some((s) => s.enforceBaseOrder)
  return Boolean(game.routeOrderEnforced ?? game.enforceBaseOrder)
}

/**
 * The game's routes in the server's order: the default route first, then the
 * stages by their order. Stage membership comes from the stages query (the one
 * a stage change invalidates), falling back to the base's own `stageId`. Empty
 * routes are left out.
 */
export function baseRouteGroups(bases: Base[], stages: Stage[], defaultEnforced: boolean): BaseRouteGroup[] {
  const stageOf = new Map<string, string>()
  for (const stage of stages) for (const id of stage.baseIds) stageOf.set(id, stage.id)
  const known = new Set(stages.map((s) => s.id))
  const routeOf = (base: Base) => {
    const stageId = stageOf.get(base.id) ?? base.stageId ?? null
    return stageId && known.has(stageId) ? stageId : null
  }
  const groups: BaseRouteGroup[] = [
    { key: DEFAULT_ROUTE_KEY, stageId: null, name: null, enforced: defaultEnforced, bases: bases.filter((b) => routeOf(b) === null) },
    ...[...stages]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((stage) => ({
        key: stage.id,
        stageId: stage.id,
        name: stage.name,
        enforced: stage.enforceBaseOrder,
        bases: bases.filter((b) => routeOf(b) === stage.id),
      })),
  ]
  return groups
    .filter((g) => g.bases.length > 0)
    .map((g) => (g.enforced ? { ...g, bases: sortBySequence(g.bases) } : g))
}

/** Numbered bases in route order; any the server has not numbered yet keep their place after them. */
function sortBySequence(bases: Base[]): Base[] {
  return bases
    .map((base, index) => ({ base, index }))
    .sort((a, b) => (a.base.sequenceNumber ?? Number.MAX_SAFE_INTEGER) - (b.base.sequenceNumber ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ base }) => base)
}
