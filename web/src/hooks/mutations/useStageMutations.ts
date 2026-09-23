import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { stagesApi } from '@/lib/api/stages'
import type { CreateStageDto, UpdateStageDto } from '@/lib/api/stages'

/**
 * A stage is a route (OW-40): creating, deleting or toggling one moves bases
 * between routes, renumbers them and can change the game's route lock, so the
 * bases and the game refresh with the stages.
 */
function invalidateRoutes(qc: QueryClient, gameId: string) {
  void qc.invalidateQueries({ queryKey: ['stages', gameId] })
  void qc.invalidateQueries({ queryKey: ['bases', gameId] })
  void qc.invalidateQueries({ queryKey: ['game', gameId] })
}

export function useCreateStage(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateStageDto) => stagesApi.create(gameId, dto),
    onSuccess: () => invalidateRoutes(qc, gameId),
  })
}

export function useUpdateStage(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stageId, dto }: { stageId: string; dto: UpdateStageDto }) =>
      stagesApi.update(gameId, stageId, dto),
    onSuccess: () => invalidateRoutes(qc, gameId),
  })
}

export function useDeleteStage(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stageId: string) => stagesApi.delete(gameId, stageId),
    onSuccess: () => invalidateRoutes(qc, gameId),
  })
}

export function useReorderStages(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (order: string[]) => stagesApi.reorder(gameId, order),
    // Stage order is route order: every stage's numbering stays, but routes swap places.
    onSuccess: () => invalidateRoutes(qc, gameId),
  })
}
