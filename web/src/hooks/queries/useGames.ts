import { useQuery } from '@tanstack/react-query'
import { gamesApi } from '@/lib/api/games'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import type { Game } from '@/types'

/**
 * The active workspace's games. The workspace is part of the query key, so
 * switching workspaces refetches instead of showing the previous one's list.
 */
export function useGames() {
  const { active } = useWorkspaceContext()
  const orgId = active.type === 'org' ? active.orgId : undefined
  return useQuery<Game[]>({
    queryKey: ['games', orgId ?? 'personal'],
    queryFn: () => gamesApi.list(orgId),
  })
}

export function useGame(gameId: string | undefined) {
  return useQuery<Game>({
    queryKey: ['game', gameId],
    queryFn: () => gamesApi.getById(gameId!),
    enabled: !!gameId,
  })
}
