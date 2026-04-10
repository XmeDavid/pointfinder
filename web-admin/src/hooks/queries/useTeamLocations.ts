import { useQuery } from '@tanstack/react-query'
import { monitoringApi } from '@/lib/api/monitoring'
import type { TeamLocation } from '@/types'

export function useTeamLocations(gameId: string | undefined) {
  return useQuery<TeamLocation[]>({
    queryKey: ['monitoring', 'locations', gameId],
    queryFn: () => monitoringApi.getTeamLocations(gameId!),
    enabled: !!gameId,
    staleTime: 5_000,
    refetchInterval: 10_000,
  })
}
