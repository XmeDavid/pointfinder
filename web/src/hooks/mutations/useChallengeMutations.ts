import { useMutation, useQueryClient } from '@tanstack/react-query'
import { challengesApi } from '@/lib/api/challenges'
import type { CreateChallengeDto } from '@/lib/api/challenges'

export function useCreateChallenge(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Omit<CreateChallengeDto, 'gameId'>) =>
      challengesApi.create({ ...dto, gameId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges', gameId] }),
  })
}

export function useUpdateChallenge(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ challengeId, dto }: { challengeId: string; dto: Partial<CreateChallengeDto> }) =>
      challengesApi.update(challengeId, { ...dto, gameId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges', gameId] }),
  })
}

export function useDeleteChallenge(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (challengeId: string) => challengesApi.delete(challengeId, gameId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges', gameId] }),
  })
}

export function useReorderChallenges(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => challengesApi.reorder(gameId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges', gameId] }),
  })
}
