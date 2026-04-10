import { useQuery } from '@tanstack/react-query'
import { challengesApi } from '@/lib/api/challenges'
import type { Challenge } from '@/types'

export function useChallenges(gameId: string | undefined) {
  return useQuery<Challenge[]>({
    queryKey: ['challenges', gameId],
    queryFn: () => challengesApi.listByGame(gameId!),
    enabled: !!gameId,
  })
}
