import type { QueryClient } from '@tanstack/react-query'
import type { AppServices } from './client'
import { onForeground, isForeground } from '@/platform/lifecycle'
import { isNative } from '@/platform/runtime'
import { startPushRegistration, type PushIdentity } from '@/platform/pushRegistration'
import { onPushNotification } from '@/platform/push'
import { useAuthStore } from '@/lib/auth/store'
import { HttpClient } from '@pointfinder/api'
import { platformFetch } from '@/platform/http'
import { apiOrigin } from '@/platform/config'
import { refreshLocationWatch, startLocationStore } from './locationStore'
import { playerGameIsLive, startArrivalDetector } from './arrival'

/** App-level recovery continues even when no player gameplay screen is mounted. */
export function startPlayerRuntime(services: AppServices, queries: QueryClient): () => void {
  let alive = true
  let syncing = false
  const sync = async () => {
    if (syncing || !alive || !isForeground() || navigator.onLine === false || services.client.session.current.kind !== 'player') return
    syncing = true
    try {
      const report = await services.queue.sync()
      if (alive && report.outcomes.some((outcome) => outcome.result === 'synced')) await queries.invalidateQueries({ refetchType: 'active' })
    } catch { /* Storage/network failures remain in the durable queue for the next attempt. */ }
    finally { syncing = false }
  }
  const resume = () => {
    if (!alive) return
    void queries.invalidateQueries({ refetchType: 'active' })
    void sync()
  }
  const offForeground = onForeground(() => { resume(); refreshLocationWatch() })
  const offAuth = services.client.session.subscribe(() => { void sync(); refreshLocationWatch() })
  const offQueue = services.queue.onChange(() => { void sync() })
  // The foreground watch belongs to the app, not the map screen: operators rely on
  // team positions in every live game and arrivals must fire from any screen.
  const offLocation = startLocationStore(() => playerGameIsLive(services, queries))
  const offArrival = startArrivalDetector(services, queries)
  const offCache = queries.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === 'snapshot') refreshLocationWatch()
  })
  window.addEventListener('online', resume)
  const timer = window.setInterval(() => void sync(), 15_000)
  const offPush = isNative() ? startPushRegistration({
    identity: (): PushIdentity | null => {
      const auth = services.client.session.current
      if (auth.kind === 'player') return { key: `player:${auth.playerId}`, register: async (registration) => {
        if (services.client.session.current.kind !== 'player' || services.client.session.current.playerId !== auth.playerId) return
        await services.client.api.player.registerPushToken({ pushToken: registration.token, platform: registration.platform })
      }, unregister: async (registration) => {
        // Capture only in memory: logout can clear the session before teardown.
        const http = new HttpClient({ baseUrl: apiOrigin(), fetch: platformFetch, getToken: async () => auth.token })
        await http.delete('/api/player/push-token', { body: { pushToken: registration.token, platform: registration.platform }, timeoutMs: 5000 })
      } }
      const operator = useAuthStore.getState()
      if (!operator.isAuthenticated || !operator.user) return null
      const id = operator.user.id
      return { key: `operator:${id}`, register: async (registration) => {
        const { default: api } = await import('@/lib/api/client')
        if (useAuthStore.getState().user?.id !== id) return
        await api.put('/users/me/push-token', { pushToken: registration.token, platform: registration.platform })
      }, unregister: async (registration) => {
        if (!operator.accessToken) return
        const http = new HttpClient({ baseUrl: apiOrigin(), fetch: platformFetch, getToken: async () => operator.accessToken })
        await http.delete('/api/users/me/push-token', { body: { pushToken: registration.token, platform: registration.platform }, timeoutMs: 5000 })
      } }
    },
    onIdentityChange: (handler) => {
      let player = services.client.session.current.kind === 'player' ? services.client.session.current.playerId : null
      const offPlayer = services.client.session.subscribe((auth) => {
        const next = auth.kind === 'player' ? auth.playerId : null
        if (player !== next) { player = next; handler() }
      })
      const offOperator = useAuthStore.subscribe((next, previous) => {
        if (next.user?.id !== previous.user?.id || next.isAuthenticated !== previous.isAuthenticated) handler()
      })
      return () => { offPlayer(); offOperator() }
    },
  }) : () => {}
  let offNotification: (() => void) | undefined
  if (isNative()) void onPushNotification(() => {
    void queries.invalidateQueries({ queryKey: ['notifications'] })
    void queries.invalidateQueries({ queryKey: ['player-notifications'] })
  }).then((off) => { if (alive) offNotification = off; else off() }).catch(() => {})
  void sync()
  return () => { alive = false; offForeground(); offAuth(); offQueue(); offPush(); offNotification?.(); offArrival(); offLocation(); offCache(); window.clearInterval(timer); window.removeEventListener('online', resume) }
}
