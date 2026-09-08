import { useQuery } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import { isScenarioId, type AccountProgressRow, type TutorialProgress } from '@/features/tutorials/types'

/**
 * The caller's guided-tutorial progress.
 *
 * The account's `introduction` row lives in the same list but belongs to the
 * introduction feature, so it is filtered out here and the engine never sees it.
 *
 * `enabled` exists so `TourHost` can hold the request back until the operator
 * session is known; players and anonymous visitors must never call it.
 */
export function useTutorialProgress(options?: { enabled?: boolean }) {
  return useQuery<AccountProgressRow[], Error, TutorialProgress[]>({
    queryKey: ['tutorials', 'me'],
    queryFn: () => tutorialsApi.list(),
    select: (rows) => rows.filter((row): row is TutorialProgress => isScenarioId(row.scenarioId)),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  })
}
