import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '@/lib/api/notifications'
import type { GameNotification } from '@/types'

export function useNotifications(gameId: string | undefined) {
  return useQuery<GameNotification[]>({
    queryKey: ['notifications', gameId],
    queryFn: () => notificationsApi.listByGame(gameId!),
    enabled: !!gameId,
  })
}
