import { useQuery } from '@tanstack/react-query'
import { assignmentsApi } from '@/lib/api/assignments'
import type { Assignment } from '@/types'

export function useAssignments(gameId: string | undefined) {
  return useQuery<Assignment[]>({
    queryKey: ['assignments', gameId],
    queryFn: () => assignmentsApi.listByGame(gameId!),
    enabled: !!gameId,
  })
}
