import type { QueueStore, MediaStore } from '@pointfinder/game-core'
import type { TokenStore, SocketFactory } from '@pointfinder/api'

export interface CachedSnapshot<T> { stateVersion: number; fetchedAt: string; snapshot: T }
export interface GameCache {
  load<T>(key: string): Promise<CachedSnapshot<T> | null>
  save<T>(key: string, version: number, snapshot: T): Promise<void>
  clear(key?: string): Promise<void>
}
export interface KeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}
export interface PlatformServices {
  fetch: typeof fetch
  tokens: TokenStore
  queue: QueueStore
  cache: GameCache
  settings: KeyValueStore
  socketFactory: SocketFactory
  media: MediaStore
}
