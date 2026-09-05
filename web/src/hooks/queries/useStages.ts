import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api/client'
import type { Stage } from '@/types/stage'

export function useStages(gameId: string | undefined) {
  return useQuery<Stage[]>({
    queryKey: ['stages', gameId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/games/${gameId}/stages`)
      return data
    },
    enabled: !!gameId,
  })
}
