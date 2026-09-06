import { useQuery } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import type { TutorialProgress } from '@/features/tutorials/types'

/**
 * The caller's guided-tutorial progress.
 *
 * `enabled` exists so `TourHost` can hold the request back until the operator
 * session is known; players and anonymous visitors must never call it.
 */
export function useTutorialProgress(options?: { enabled?: boolean }) {
  return useQuery<TutorialProgress[]>({
    queryKey: ['tutorials', 'me'],
    queryFn: () => tutorialsApi.list(),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  })
}
