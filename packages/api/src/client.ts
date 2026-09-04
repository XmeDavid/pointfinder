import { AuthSession, type TokenStore } from './auth'
import { createApi, type PointFinderApi } from './endpoints'
import { HttpClient } from './http'
import { RealtimeClient, type SocketFactory } from './realtime'

export interface ClientOptions {
  baseUrl: string
  tokenStore: TokenStore
  socketFactory: SocketFactory
  fetch?: typeof fetch
  onLogout?: (reason: 'refresh_rejected' | 'explicit' | 'server_revoked') => void
}

export interface PointFinderClient {
  api: PointFinderApi
  session: AuthSession
  realtime: RealtimeClient
  http: HttpClient
}

/**
 * Wires the pieces together the way every app should: one session that
 * feeds tokens to both HTTP and realtime, a 401 that triggers exactly one
 * refresh-and-retry, and a refresh rejection that logs out everywhere.
 */
export function createClient(options: ClientOptions): PointFinderClient {
  const anonymous = new HttpClient({ baseUrl: options.baseUrl, fetch: options.fetch })
  const session = new AuthSession({ store: options.tokenStore, http: anonymous, onLogout: options.onLogout })
  const http = new HttpClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    getToken: () => session.getToken(),
    onUnauthorized: async () => (await session.refreshAfterRejection()) !== null,
  })
  const realtime = new RealtimeClient({
    baseUrl: options.baseUrl,
    socketFactory: options.socketFactory,
    getToken: () => session.getToken().catch(() => null),
  })
  return { api: createApi(http), session, realtime, http }
}
