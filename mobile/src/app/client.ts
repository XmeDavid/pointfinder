import { createClient, type PointFinderClient } from '@pointfinder/api'
import { OfflineQueue, MemoryQueueStore, type QueueStore } from '@pointfinder/game-core'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { API_URL } from './config'
import {
  LocalStorageTokenStore,
  SecureTokenStore,
  SqliteQueueStore,
  browserSocketFactory,
  isNative,
  tauriSocketFactory,
} from '../platform'

/**
 * HTTP from Rust: no CORS, platform TLS. The plugin would add `Origin: http://tauri.localhost`,
 * which Spring's CORS filter rejects with 403, so we send an empty Origin and the plugin drops
 * the header (needs its `unsafe-headers` feature). The request then looks like a native app's.
 */
const nativeFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('Origin', '')
  return tauriFetch(input, { ...init, headers })
}

export interface AppServices {
  client: PointFinderClient
  queue: OfflineQueue
}

/**
 * One instance for the whole app. On phones every piece is backed by native storage;
 * in a plain browser (dev only) it falls back to localStorage and in-memory.
 */
export function createServices(): AppServices {
  const native = isNative()
  const client = createClient({
    baseUrl: API_URL,
    // Native fetch runs in Rust: no CORS, platform TLS. The browser fallback is dev only.
    fetch: native ? (nativeFetch as typeof fetch) : undefined,
    tokenStore: native ? new SecureTokenStore() : new LocalStorageTokenStore(),
    socketFactory: native ? tauriSocketFactory : browserSocketFactory,
  })
  const store: QueueStore = native ? new SqliteQueueStore() : new MemoryQueueStore()
  const queue = new OfflineQueue({
    store,
    executor: {
      checkIn: (a) => client.api.player.checkIn(a.gameId, a.baseId, a.nfcToken),
      submit: (a) => client.api.player.submit(a.gameId, { baseId: a.baseId, challengeId: a.challengeId, answer: a.answer, fileUrls: a.fileUrls ?? undefined, idempotencyKey: a.id }),
    },
  })
  return { client, queue }
}
