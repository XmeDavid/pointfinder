import { useQuery } from '@tanstack/react-query'
import { gamesApi } from '@/lib/api/games'
import type { Game } from '@/types'

export function useGames() {
  return useQuery<Game[]>({
    queryKey: ['games'],
    queryFn: () => gamesApi.list(),
  })
}

export function useGame(gameId: string | undefined) {
  return useQuery<Game>({
    queryKey: ['game', gameId],
    queryFn: () => gamesApi.getById(gameId!),
    enabled: !!gameId,
  })
}
