import { useMutation, useQueryClient } from '@tanstack/react-query'
import { assignmentsApi, type CreateAssignmentDto } from '@/lib/api/assignments'
import type { Assignment } from '@/types'

export function useCreateAssignment(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['assignments', 'create'],
    mutationFn: (dto: CreateAssignmentDto) =>
      assignmentsApi.create({ ...dto, gameId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', gameId] }),
  })
}

/**
 * Replaces the game's whole assignment set. The new list is shown at once
 * (the grid and the two editors send complete lists), and a refused write
 * puts the server's list back.
 */
export function useSetAssignments(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['assignments', 'set'],
    mutationFn: (assignments: Omit<Assignment, 'id'>[]) =>
      assignmentsApi.bulkSet(gameId, assignments),
    onMutate: async (assignments) => {
      await qc.cancelQueries({ queryKey: ['assignments', gameId] })
      const previous = qc.getQueryData<Assignment[]>(['assignments', gameId])
      qc.setQueryData<Assignment[]>(
        ['assignments', gameId],
        assignments.map((a, i) => ({ ...a, id: (a as Assignment).id ?? `pending-${i}` })),
      )
      return { previous }
    },
    onError: (_error, _assignments, context) => {
      if (context?.previous) qc.setQueryData(['assignments', gameId], context.previous)
      qc.invalidateQueries({ queryKey: ['assignments', gameId] })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', gameId] }),
  })
}

export function useDeleteAssignment(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: string) => assignmentsApi.delete(assignmentId, gameId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', gameId] }),
  })
}
