import { useQuery } from '@tanstack/react-query'
import { teamVariablesApi } from '@/lib/api/team-variables'
import type { TeamVariablesResponse, VariableCompletenessResponse } from '@/lib/api/team-variables'

export function useGameVariables(gameId: string | undefined) {
  return useQuery<TeamVariablesResponse>({
    queryKey: ['variables', gameId],
    queryFn: () => teamVariablesApi.getGameVariables(gameId!),
    enabled: !!gameId,
  })
}

export function useChallengeVariables(
  gameId: string | undefined,
  challengeId: string | undefined,
) {
  return useQuery<TeamVariablesResponse>({
    queryKey: ['variables', gameId, 'challenge', challengeId],
    queryFn: () => teamVariablesApi.getChallengeVariables(gameId!, challengeId!),
    enabled: !!gameId && !!challengeId,
  })
}

export function useVariableCompleteness(gameId: string | undefined) {
  return useQuery<VariableCompletenessResponse>({
    queryKey: ['variables', gameId, 'completeness'],
    queryFn: () => teamVariablesApi.checkCompleteness(gameId!),
    enabled: !!gameId,
  })
}
