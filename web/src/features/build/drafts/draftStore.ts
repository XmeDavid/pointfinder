import { create } from 'zustand'
import { kv } from '@/platform'
import type { SaveState } from '@/components/status'

/**
 * Editor drafts that survive navigation, a killed WebView and a failed save.
 *
 * A draft is the operator's local copy of one entity's editable fields plus
 * the server snapshot it was derived from (the baseline). Drafts are written
 * to the platform key-value boundary promptly (the browser or native storage adapter) and are scoped by account, game and entity so one
 * phone never restores another account's edits. A draft is local work only:
 * it is never presented as a confirmed server save.
 */
export type { SaveState }

export interface SaveStatus {
  state: SaveState
  /** Human-readable failure from the last save attempt. */
  error?: string
  /** When the last successful save completed. */
  savedAt?: number
}

export interface DraftRecord<T = unknown> {
  fields: T
  baseline: T
  updatedAt: number
}

export type DraftEntity = 'base' | 'challenge'

export function draftKey(accountId: string | null | undefined, gameId: string, entity: DraftEntity, entityId: string): string {
  return `draft:${accountId || 'anonymous'}:${gameId}:${entity}:${entityId}`
}

interface DraftStoreState {
  records: Record<string, DraftRecord | null>
  hydrated: Record<string, boolean>
  status: Record<string, SaveStatus>
}

interface DraftStoreActions {
  hydrate: (key: string) => Promise<DraftRecord | null>
  write: <T>(key: string, fields: T, baseline: T) => void
  clear: (key: string) => void
  setStatus: (key: string, status: SaveStatus) => void
  /** Test and sign-out helper: drops every in-memory record and status. */
  resetAll: () => void
}

const STORAGE_PREFIX = 'pf.'
const pendingWrites = new Map<string, Promise<void>>()
const hydrations = new Map<string, Promise<DraftRecord | null>>()
let generation = 0

function persist(key: string, record: DraftRecord | null) {
  const epoch = generation
  // Start promptly and serialize writes so an older save cannot replace a
  // newer draft (or resurrect a discarded one) on a slower native store.
  const previous = pendingWrites.get(key) ?? Promise.resolve()
  const write = previous.then(async () => {
    if (epoch !== generation) return
    try {
      if (record) await kv.set(STORAGE_PREFIX + key, JSON.stringify(record))
      else await kv.remove(STORAGE_PREFIX + key)
    } catch {
      if (epoch === generation && useDraftStore.getState().records[key]) {
        useDraftStore.getState().setStatus(key, { state: 'storage-error' })
      }
    }
  }).finally(() => {
    if (pendingWrites.get(key) === write) pendingWrites.delete(key)
  })
  pendingWrites.set(key, write)
}

/** Await every queued write, including writes added while a previous one lands. */
export async function flushDraftWrites(): Promise<void> {
  while (pendingWrites.size) await Promise.all(pendingWrites.values())
}

export const useDraftStore = create<DraftStoreState & DraftStoreActions>()((set, get) => ({
  records: {},
  hydrated: {},
  status: {},

  hydrate: (key) => {
    if (get().hydrated[key]) return Promise.resolve(get().records[key] ?? null)
    const inFlight = hydrations.get(key)
    if (inFlight) return inFlight
    const promise = kv
      .get(STORAGE_PREFIX + key)
      .then((raw) => {
        let record: DraftRecord | null = null
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as DraftRecord
            if (parsed && typeof parsed === 'object' && 'fields' in parsed && 'baseline' in parsed) record = parsed
          } catch {
            record = null
          }
        }
        return record
      })
      .catch(() => {
        get().setStatus(key, { state: 'storage-error' })
        return null
      })
      .then((record) => {
        hydrations.delete(key)
        // A write that happened while loading wins over the stored copy.
        const current = get().records[key]
        set((s) => ({
          hydrated: { ...s.hydrated, [key]: true },
          records: { ...s.records, [key]: current === undefined ? record : current },
        }))
        return current === undefined ? record : (current ?? null)
      })
    hydrations.set(key, promise)
    return promise
  },

  write: (key, fields, baseline) => {
    const record: DraftRecord = { fields, baseline, updatedAt: Date.now() }
    set((s) => ({ records: { ...s.records, [key]: record } }))
    persist(key, record)
  },

  clear: (key) => {
    set((s) => {
      const records = { ...s.records, [key]: null }
      return { records }
    })
    persist(key, null)
  },

  setStatus: (key, status) => set((s) => ({ status: { ...s.status, [key]: status } })),

  resetAll: () => {
    generation += 1
    pendingWrites.clear()
    hydrations.clear()
    set({ records: {}, hydrated: {}, status: {} })
  },
}))

/** Stable structural equality for flat editor field objects. */
export function sameFields(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}
