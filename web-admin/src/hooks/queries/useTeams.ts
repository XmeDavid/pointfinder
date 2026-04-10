import { useQuery } from '@tanstack/react-query'
import { teamsApi } from '@/lib/api/teams'
import type { Team, Player } from '@/types'

export function useTeams(gameId: string | undefined) {
  return useQuery<Team[]>({
    queryKey: ['teams', gameId],
    queryFn: () => teamsApi.listByGame(gameId!),
    enabled: !!gameId,
  })
}

export function useTeamPlayers(gameId: string | undefined, teamId: string | undefined) {
  return useQuery<Player[]>({
    queryKey: ['teams', gameId, teamId, 'players'],
    queryFn: () => teamsApi.getPlayers(teamId!, gameId),
    enabled: !!gameId && !!teamId,
  })
}
