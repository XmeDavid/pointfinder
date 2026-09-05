import { useQuery } from '@tanstack/react-query'
import { useAuth, useServices } from '@/app/player/services'

/** Unread operator messages. Realtime `notification` events invalidate the `notifications` prefix. */
export function useUnseenCount() {
  const auth = useAuth()
  const { client } = useServices()
  const query = useQuery({
    queryKey: ['notifications', 'unseen'],
    queryFn: () => client.api.player.unseenNotificationCount(),
    enabled: auth.kind === 'player',
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  return query.data?.count ?? 0
}
