import { useQuery } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import type { AccountProgressRow } from '@/features/tutorials/types'
import { INTRODUCTION_SCENARIO, type IntroductionRow } from './progress'

/**
 * The caller's introduction row, or null when the account never touched it.
 * Shares the guided tutorials' cache entry (one request, two views of it), so
 * a write invalidating `['tutorials', 'me']` refreshes both.
 */
export function useIntroductionProgress(options?: { enabled?: boolean }) {
  return useQuery<AccountProgressRow[], Error, IntroductionRow | null>({
    queryKey: ['tutorials', 'me'],
    queryFn: () => tutorialsApi.list(),
    select: (rows) => (rows.find((row) => row.scenarioId === INTRODUCTION_SCENARIO) as IntroductionRow | undefined) ?? null,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  })
}
