import { useMutation, useQueryClient } from '@tanstack/react-query'
import { assignmentsApi, type CreateAssignmentDto } from '@/lib/api/assignments'
import type { Assignment } from '@/types'

export function useCreateAssignment(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateAssignmentDto) =>
      assignmentsApi.create({ ...dto, gameId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', gameId] }),
  })
}

export function useSetAssignments(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assignments: Omit<Assignment, 'id'>[]) =>
      assignmentsApi.bulkSet(gameId, assignments),
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
