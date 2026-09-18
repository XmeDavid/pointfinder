import { kv } from '@/platform'
import type { Game } from '@/types'

const writes = new Map<string, Promise<void>>()
const LIMIT = 10

function storageKey(accountId: string, orgId: string | null) {
  return `organizing-recency:${JSON.stringify([accountId, orgId])}`
}

async function read(key: string): Promise<string[]> {
  const raw = await kv.get(key)
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, LIMIT)
      : []
  } catch { return [] }
}

/** Only IDs are stored. Names and permission to open come from a fresh server read. */
export function recordOrganizedGame(accountId: string, gameId: string, orgId: string | null): Promise<void> {
  const key = storageKey(accountId, orgId)
  const pending = (writes.get(key) ?? Promise.resolve()).then(async () => {
    const previous = await read(key)
    if (previous[0] === gameId) return
    await kv.set(key, JSON.stringify([gameId, ...previous.filter(id => id !== gameId)].slice(0, LIMIT)))
  })
  const settled = pending.catch(() => {}).finally(() => {
    if (writes.get(key) === settled) writes.delete(key)
  })
  writes.set(key, settled)
  return pending
}

export async function recentOrganizedGames(accountId: string, orgId: string | null): Promise<string[]> {
  const key = storageKey(accountId, orgId)
  await writes.get(key)
  return read(key)
}

type RecentGame = Pick<Game, 'id' | 'name' | 'status' | 'orgId'>

/** Skip revoked/deleted entries; a connection failure remains retryable. */
export async function findRecentOrganizedGame(ids: string[], orgId: string | null, getGame: (id: string) => Promise<RecentGame>): Promise<RecentGame | null> {
  for (const id of ids) {
    try {
      const game = await getGame(id)
      if (game.id === id && (game.orgId ?? null) === orgId) return game
    } catch (error) {
      const status = (error as { status?: number; response?: { status?: number } })?.status
        ?? (error as { response?: { status?: number } })?.response?.status
      if (status !== 403 && status !== 404) throw error
    }
  }
  return null
}

