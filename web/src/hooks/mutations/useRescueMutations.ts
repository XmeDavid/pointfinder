import { useMutation, useQueryClient } from '@tanstack/react-query'
import { teamsApi } from '@/lib/api/teams'
import type { OperatorCheckInRequest, MarkCompletedRequest, UnlockOverrideRequest } from '@/lib/api/teams'

export function useManualCheckIn(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      teamId,
      baseId,
      body,
    }: {
      teamId: string
      baseId: string
      body?: OperatorCheckInRequest
    }) => teamsApi.manualCheckIn(gameId, teamId, baseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', gameId] })
      qc.invalidateQueries({ queryKey: ['monitoring', 'activity', gameId] })
      qc.invalidateQueries({ queryKey: ['monitoring', 'progress', gameId] })
    },
  })
}

export function useMarkCompleted(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      teamId,
      baseId,
      request,
    }: {
      teamId: string
      baseId: string
      request: MarkCompletedRequest
    }) => teamsApi.markCompleted(gameId, teamId, baseId, request),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', gameId] })
      qc.invalidateQueries({ queryKey: ['monitoring', 'dashboard', gameId] })
      qc.invalidateQueries({ queryKey: ['monitoring', 'activity', gameId] })
      qc.invalidateQueries({ queryKey: ['monitoring', 'progress', gameId] })
    },
  })
}

export function useUnlockOverride(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      teamId,
      baseId,
      body,
    }: {
      teamId: string
      baseId: string
      body?: UnlockOverrideRequest
    }) => teamsApi.createUnlockOverride(gameId, teamId, baseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bases', gameId] })
      qc.invalidateQueries({ queryKey: ['monitoring', 'activity', gameId] })
    },
  })
}

export function useRemoveUnlockOverride(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      teamId,
      baseId,
      body,
    }: {
      teamId: string
      baseId: string
      body?: UnlockOverrideRequest
    }) => teamsApi.removeUnlockOverride(gameId, teamId, baseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bases', gameId] })
      qc.invalidateQueries({ queryKey: ['monitoring', 'activity', gameId] })
    },
  })
}
