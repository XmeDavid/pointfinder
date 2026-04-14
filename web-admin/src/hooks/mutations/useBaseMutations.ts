import { useMutation, useQueryClient } from '@tanstack/react-query'
import { basesApi } from '@/lib/api/bases'
import type { CreateBaseDto } from '@/lib/api/bases'

export function useCreateBase(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Omit<CreateBaseDto, 'gameId'>) =>
      basesApi.create({ ...dto, gameId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bases', gameId] }),
  })
}

export function useUpdateBase(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ baseId, dto }: { baseId: string; dto: Partial<CreateBaseDto> }) =>
      basesApi.update(baseId, { ...dto, gameId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bases', gameId] })
      qc.invalidateQueries({ queryKey: ['stages', gameId] })
    },
  })
}

export function useDeleteBase(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (baseId: string) => basesApi.delete(baseId, gameId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bases', gameId] }),
  })
}

export function useReorderBases(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => basesApi.reorder(gameId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bases', gameId] }),
  })
}
