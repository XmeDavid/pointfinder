import { db } from '@/platform/tauri/db'

export interface CachedSnapshot<T> {
  stateVersion: number
  fetchedAt: string
  snapshot: T
}

/** Last server snapshot per game, so the app opens instantly and keeps working offline. */
export const gameCache = {
  async load<T>(gameId: string): Promise<CachedSnapshot<T> | null> {
    const rows = await (await db()).select<{ state_version: number; fetched_at: string; snapshot: string }[]>(
      'SELECT state_version, fetched_at, snapshot FROM game_cache WHERE game_id = $1',
      [gameId],
    )
    const row = rows[0]
    if (!row) return null
    try {
      return { stateVersion: row.state_version, fetchedAt: row.fetched_at, snapshot: JSON.parse(row.snapshot) as T }
    } catch {
      return null
    }
  },

  async save<T>(gameId: string, stateVersion: number, snapshot: T): Promise<void> {
    await (await db()).execute(
      `INSERT INTO game_cache (game_id, state_version, fetched_at, snapshot) VALUES ($1, $2, $3, $4)
       ON CONFLICT(game_id) DO UPDATE SET state_version = excluded.state_version, fetched_at = excluded.fetched_at, snapshot = excluded.snapshot`,
      [gameId, stateVersion, new Date().toISOString(), JSON.stringify(snapshot)],
    )
  },

  async clear(gameId?: string): Promise<void> {
    const d = await db()
    if (gameId) await d.execute('DELETE FROM game_cache WHERE game_id = $1', [gameId])
    else await d.execute('DELETE FROM game_cache')
  },
}
