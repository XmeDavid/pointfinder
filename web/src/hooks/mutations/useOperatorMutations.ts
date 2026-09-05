import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invitesApi, type CreateInviteDto } from '@/lib/api/invites'
import { gamesApi } from '@/lib/api/games'

export function useInviteOperator(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) =>
      invitesApi.create({ email, gameId } as CreateInviteDto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game-invites', gameId] })
    },
  })
}

export function useRevokeInvite(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: string) => invitesApi.delete(inviteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game-invites', gameId] })
    },
  })
}

export function useRemoveOperator(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => gamesApi.removeOperator(gameId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game-operators', gameId] })
    },
  })
}
