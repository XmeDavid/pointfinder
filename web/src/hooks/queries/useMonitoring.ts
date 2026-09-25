import { useQuery } from '@tanstack/react-query'
import { monitoringApi } from '@/lib/api/monitoring'

export function useDashboardStats(gameId: string | undefined) {
  return useQuery({
    queryKey: ['monitoring', 'dashboard', gameId],
    queryFn: () => monitoringApi.getDashboardStats(gameId!),
    enabled: !!gameId,
  })
}

/** OW-18: stalled and unlinked uploads; refreshed every minute while Monitor is open. */
export function useUploadAttention(gameId: string | undefined) {
  return useQuery({
    queryKey: ['monitoring', 'upload-attention', gameId],
    queryFn: () => monitoringApi.getUploadAttention(gameId!),
    enabled: !!gameId,
    refetchInterval: 60_000,
  })
}

export function useLeaderboard(gameId: string | undefined) {
  return useQuery({
    queryKey: ['monitoring', 'leaderboard', gameId],
    queryFn: () => monitoringApi.getLeaderboard(gameId!),
    enabled: !!gameId,
  })
}

export function useActivityFeed(gameId: string | undefined) {
  return useQuery({
    queryKey: ['monitoring', 'activity', gameId],
    queryFn: () => monitoringApi.getActivityEvents(gameId!),
    enabled: !!gameId,
  })
}

export function useProgress(gameId: string | undefined) {
  return useQuery({
    queryKey: ['monitoring', 'progress', gameId],
    queryFn: () => monitoringApi.getProgress(gameId!),
    enabled: !!gameId,
  })
}

export function useResultsExport(gameId: string | undefined) {
  return useQuery({
    queryKey: ['monitoring', 'results-export', gameId],
    queryFn: () => monitoringApi.getResultsExport(gameId!),
    enabled: !!gameId,
  })
}
