import { useMutation, useQueryClient } from '@tanstack/react-query'
import { stagesApi } from '@/lib/api/stages'
import type { CreateStageDto, UpdateStageDto } from '@/lib/api/stages'

export function useCreateStage(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateStageDto) => stagesApi.create(gameId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stages', gameId] }),
  })
}

export function useUpdateStage(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stageId, dto }: { stageId: string; dto: UpdateStageDto }) =>
      stagesApi.update(gameId, stageId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stages', gameId] }),
  })
}

export function useDeleteStage(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stageId: string) => stagesApi.delete(gameId, stageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stages', gameId] }),
  })
}

export function useReorderStages(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (order: string[]) => stagesApi.reorder(gameId, order),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stages', gameId] }),
  })
}
