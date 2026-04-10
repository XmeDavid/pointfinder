import { useQuery } from '@tanstack/react-query'
import { tagsApi } from '@/lib/api/tags'
import type { Tag } from '@/types'

export function useTags(gameId: string | undefined) {
  return useQuery<Tag[]>({
    queryKey: ['tags', gameId],
    queryFn: () => tagsApi.listByGame(gameId!),
    enabled: !!gameId,
  })
}
