import { useQuery } from '@tanstack/react-query'
import { gamesApi } from '@/lib/api/games'
import { invitesApi } from '@/lib/api/invites'

export function useGameOperators(gameId: string) {
  return useQuery({
    queryKey: ['game-operators', gameId],
    queryFn: () => gamesApi.getOperators(gameId),
    staleTime: 30_000,
  })
}

export function useGameInvites(gameId: string) {
  return useQuery({
    queryKey: ['game-invites', gameId],
    queryFn: () => invitesApi.listByGame(gameId),
    staleTime: 30_000,
  })
}
