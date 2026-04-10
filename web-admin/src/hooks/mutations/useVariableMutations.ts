import { useMutation, useQueryClient } from '@tanstack/react-query'
import { teamVariablesApi } from '@/lib/api/team-variables'
import type { TeamVariablesBulkRequest } from '@/lib/api/team-variables'

export function useSaveGameVariables(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TeamVariablesBulkRequest) =>
      teamVariablesApi.saveGameVariables(gameId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['variables', gameId] })
    },
  })
}

export function useSaveChallengeVariables(gameId: string, challengeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TeamVariablesBulkRequest) =>
      teamVariablesApi.saveChallengeVariables(gameId, challengeId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['variables', gameId, 'challenge', challengeId] })
    },
  })
}
