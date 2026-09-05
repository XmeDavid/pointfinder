import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/lib/api/notifications'
import type { SendNotificationDto } from '@/lib/api/notifications'

export function useSendNotification(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: SendNotificationDto) =>
      notificationsApi.send({ ...dto, gameId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', gameId] }),
  })
}
