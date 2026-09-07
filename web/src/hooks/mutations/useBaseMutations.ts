import { useMutation, useQueryClient } from '@tanstack/react-query'
import { basesApi } from '@/lib/api/bases'
import type { CreateBaseDto } from '@/lib/api/bases'
import type { Base } from '@/types'

/**
 * The server's response lands in the bases cache before the refetch, so
 * anything reading the list (the map, the readiness checks, a tutorial guard
 * that keys on the saved check-in method) sees the saved base at the moment
 * the mutation succeeds rather than one round trip later.
 */
function writeBase(qc: ReturnType<typeof useQueryClient>, gameId: string, saved: Base) {
  qc.setQueryData<Base[]>(['bases', gameId], (old) => {
    if (!old) return old
    return old.some((b) => b.id === saved.id) ? old.map((b) => (b.id === saved.id ? saved : b)) : [...old, saved]
  })
}

export function useCreateBase(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['base', 'create'],
    mutationFn: (dto: Omit<CreateBaseDto, 'gameId'>) =>
      basesApi.create({ ...dto, gameId }),
    onSuccess: (created) => {
      writeBase(qc, gameId, created)
      return qc.invalidateQueries({ queryKey: ['bases', gameId] })
    },
  })
}

export function useUpdateBase(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['base', 'update'],
    mutationFn: ({ baseId, dto }: { baseId: string; dto: Partial<CreateBaseDto> }) =>
      basesApi.update(baseId, { ...dto, gameId }),
    onSuccess: (updated) => {
      writeBase(qc, gameId, updated)
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
