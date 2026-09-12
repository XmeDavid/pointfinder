import { useQuery } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import { isScenarioId, type AccountProgressRow, type TutorialProgress } from '@/features/tutorials/types'

/**
 * The caller's guided-tutorial progress.
 *
 * Rows the engine does not know (the retired account `introduction` row still
 * returned for older accounts) are filtered out here.
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
