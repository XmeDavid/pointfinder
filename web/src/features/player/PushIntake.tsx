import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/player/services'
import { onPushNotification, onPushTap } from '@/platform/push'

/**
 * A push about the game refreshes the inbox; tapping one opens it. The payload is never
 * rendered directly: the inbox fetches the authorised list from the server.
 */
export function PushIntake() {
  const auth = useAuth()
  const navigate = useNavigate()
  const queries = useQueryClient()
  const isPlayer = auth.kind === 'player'

  useEffect(() => {
    if (!isPlayer) return
    let disposed = false
    const controller = new AbortController()
    const offs: Array<() => void> = []
    const keep = (off: () => void) => (disposed ? off() : offs.push(off))
    void onPushNotification(() => { if (!disposed) void queries.invalidateQueries({ queryKey: ['notifications'] }) }).then(keep).catch(() => {})
    void onPushTap(() => { if (disposed) return; void queries.invalidateQueries({ queryKey: ['notifications'] }); navigate('/inbox') }, { signal: controller.signal }).then(keep).catch(() => {})
    return () => { disposed = true; controller.abort(); offs.forEach((off) => off()) }
  }, [isPlayer, navigate, queries])

  return null
}
