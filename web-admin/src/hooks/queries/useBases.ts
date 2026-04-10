import { useQuery } from '@tanstack/react-query'
import { basesApi } from '@/lib/api/bases'
import type { Base } from '@/types'

export function useBases(gameId: string | undefined) {
  return useQuery<Base[]>({
    queryKey: ['bases', gameId],
    queryFn: () => basesApi.listByGame(gameId!),
    enabled: !!gameId,
  })
}
