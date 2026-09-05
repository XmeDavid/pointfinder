import { ApiError } from '@pointfinder/api'
import type { PendingAction, QueueStore, MediaStore } from '@pointfinder/game-core'
import type { CachedSnapshot, GameCache, KeyValueStore } from '../contracts'

const DB_NAME = 'pointfinder'
type Store = 'queue' | 'snapshots' | 'settings' | 'media'
let connection: Promise<IDBDatabase> | undefined
function database(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      for (const name of ['queue', 'snapshots', 'settings', 'media']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name)
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined }
      resolve(request.result)
    }
    request.onerror = () => { connection = undefined; reject(request.error) }
    request.onblocked = () => reject(new Error('Close other PointFinder tabs to upgrade offline storage.'))
  })
  return connection
}
/** Resolve writes only when the transaction commits, so "queued" really means durable. */
async function transaction<T>(store: Store, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = operation(tx.objectStore(store))
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error('Offline storage write failed'))
    tx.onerror = () => reject(tx.error ?? request.error)
  })
}
export class BrowserQueueStore implements QueueStore {
  list(): Promise<PendingAction[]> { return transaction('queue', 'readonly', (s) => s.getAll()) }
  async upsert(action: PendingAction): Promise<void> { await transaction('queue', 'readwrite', (s) => s.put(action, action.id)) }
  async remove(id: string): Promise<void> { await transaction('queue', 'readwrite', (s) => s.delete(id)) }
}
export const browserGameCache: GameCache = {
  async load<T>(key: string) { return (await transaction<CachedSnapshot<T> | undefined>('snapshots', 'readonly', (s) => s.get(key))) ?? null },
  async save(key, stateVersion, snapshot) { await transaction('snapshots', 'readwrite', (s) => s.put({ stateVersion, fetchedAt: new Date().toISOString(), snapshot }, key)) },
  async clear(key) { await transaction('snapshots', 'readwrite', (s) => key ? s.delete(key) : s.clear()) },
}
export const browserSettings: KeyValueStore = {
  async get(key) { return (await transaction<string | undefined>('settings', 'readonly', (s) => s.get(key))) ?? null },
  async set(key, value) { await transaction('settings', 'readwrite', (s) => s.put(value, key)) },
  async remove(key) { await transaction('settings', 'readwrite', (s) => s.delete(key)) },
}

export const browserMediaStore: MediaStore = {
  async put(id, file) { await transaction('media', 'readwrite', (s) => s.put({ file, createdAt: Date.now(), id }, id)) },
  async read(id, offset, length) {
    const record = await transaction<{ file: Blob } | undefined>('media', 'readonly', (s) => s.get(id))
    if (!record) throw new ApiError({ status: 422, code: 'MEDIA_NEEDS_RESELECT', message: 'The saved media is missing' })
    return new Uint8Array(await record.file.slice(offset, offset + length).arrayBuffer())
  },
  async remove(id) { await transaction('media', 'readwrite', (s) => s.delete(id)) },
  async prune(retainedIds) {
    const records = await transaction<{ id: string; createdAt: number }[]>('media', 'readonly', (s) => s.getAll())
    const retained = new Set(retainedIds)
    for (const record of records) {
      if (!retained.has(record.id) && record.createdAt < Date.now() - 86400_000) await transaction('media', 'readwrite', (s) => s.delete(record.id))
    }
  },
}
