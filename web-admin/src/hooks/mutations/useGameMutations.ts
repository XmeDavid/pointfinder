import { useMutation, useQueryClient } from '@tanstack/react-query'
import { gamesApi } from '@/lib/api/games'
import type { CreateGameDto, GameImportData } from '@/lib/api/games'
import type { Game, GameStatus } from '@/types'

export function useCreateGame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateGameDto) => gamesApi.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['games'] }),
  })
}

export function useUpdateGame(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<CreateGameDto>) => {
      const current = qc.getQueryData<Game>(['game', gameId])
      const merged: Partial<CreateGameDto> = current
        ? {
            name: current.name,
            description: current.description,
            startDate: current.startDate ?? undefined,
            endDate: current.endDate ?? undefined,
            uniformAssignment: current.uniformAssignment,
            broadcastEnabled: current.broadcastEnabled,
            tileSource: current.tileSource,
            unlockTrigger: current.unlockTrigger,
            ...dto,
          }
        : dto
      return gamesApi.update(gameId, merged)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game', gameId] })
      qc.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

export function useDeleteGame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => gamesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['games'] }),
  })
}

export function useUpdateGameStatus(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ status, resetProgress }: { status: GameStatus; resetProgress?: boolean }) =>
      gamesApi.updateStatus(gameId, status, resetProgress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game', gameId] })
      qc.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

export function useImportGame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (importData: GameImportData) => gamesApi.importGame(importData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['games'] }),
  })
}
