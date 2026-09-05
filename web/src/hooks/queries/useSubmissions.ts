import { useQuery } from '@tanstack/react-query'
import { submissionsApi } from '@/lib/api/submissions'
import type { Submission } from '@/types'

export function useSubmissions(
  gameId: string | undefined,
  filters?: { teamId?: string; status?: string },
) {
  return useQuery<Submission[]>({
    queryKey: ['submissions', gameId, filters],
    queryFn: async () => {
      if (filters?.teamId) {
        return submissionsApi.listByTeam(filters.teamId, gameId!)
      }
      return submissionsApi.listByGame(gameId!)
    },
    enabled: !!gameId,
  })
}
