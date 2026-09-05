import { isNative } from './runtime'
import { BrowserQueueStore, browserGameCache, browserSettings, browserMediaStore } from './browser/storage'
import { BrowserTokenStore } from './browser/tokenStore'
import { platformFetch } from './http'
import type { PlatformServices, GameCache, KeyValueStore } from './contracts'

export { isNative } from './runtime'
export type { PlatformServices } from './contracts'
export const kv: KeyValueStore = {
  get: async (key) => isNative() ? (await import('./tauri/kv')).kv.get(key) : browserSettings.get(key),
  set: async (key, value) => isNative() ? (await import('./tauri/kv')).kv.set(key, value) : browserSettings.set(key, value),
  remove: async (key) => isNative() ? (await import('./tauri/kv')).kv.remove(key) : browserSettings.remove(key),
}
export const gameCache: GameCache = {
  load: async (key) => isNative() ? (await import('./tauri/gameCache')).gameCache.load(key) : browserGameCache.load(key),
  save: async (key, version, snapshot) => isNative() ? (await import('./tauri/gameCache')).gameCache.save(key, version, snapshot) : browserGameCache.save(key, version, snapshot),
  clear: async (key) => isNative() ? (await import('./tauri/gameCache')).gameCache.clear(key) : browserGameCache.clear(key),
}
export async function createPlatformServices(): Promise<PlatformServices> {
  if (isNative()) {
    const [{ SecureTokenStore }, { SqliteQueueStore }, { tauriSocketFactory }] = await Promise.all([
      import('./tauri/secureTokenStore'), import('./tauri/sqliteQueueStore'), import('./tauri/socketFactory'),
    ])
    const { nativeMediaStore } = await import('./tauri/media')
    return { fetch: platformFetch, tokens: new SecureTokenStore(), queue: new SqliteQueueStore(), cache: gameCache, settings: kv, socketFactory: tauriSocketFactory, media: nativeMediaStore }
  }
  const { browserSocketFactory } = await import('./browser/socketFactory')
  return { fetch: platformFetch, tokens: new BrowserTokenStore(), queue: new BrowserQueueStore(), cache: gameCache, settings: kv, socketFactory: browserSocketFactory, media: browserMediaStore }
}
