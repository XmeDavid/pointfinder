import { useMutation, useQueryClient } from '@tanstack/react-query'
import { teamsApi } from '@/lib/api/teams'
import type { CreateTeamDto, UpdateTeamDto } from '@/lib/api/teams'

export function useCreateTeam(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateTeamDto) =>
      teamsApi.create({ ...dto, gameId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', gameId] }),
  })
}

export function useUpdateTeam(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ teamId, dto }: { teamId: string; dto: UpdateTeamDto }) =>
      teamsApi.update(teamId, gameId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', gameId] }),
  })
}

export function useDeleteTeam(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (teamId: string) => teamsApi.delete(teamId, gameId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', gameId] }),
  })
}

export function useRemovePlayer(gameId: string, teamId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (playerId: string) => teamsApi.removePlayer(teamId, playerId, gameId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', gameId, teamId, 'players'] }),
  })
}
