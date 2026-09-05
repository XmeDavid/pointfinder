import type { PendingAction, QueueStore } from '@pointfinder/game-core'
import { db } from '@/platform/tauri/db'

interface Row {
  id: string
  game_id: string
  type: string
  created_at: string
  state: string
  next_attempt_at: number
  payload: string
}

/**
 * Durable offline queue. The indexed columns are what sync needs to pick work;
 * the full action lives in `payload` so the schema never has to chase the TS type.
 */
export class SqliteQueueStore implements QueueStore {
  async list(): Promise<PendingAction[]> {
    const rows = await (await db()).select<Row[]>('SELECT payload FROM queue ORDER BY created_at')
    return rows.map((r) => JSON.parse(r.payload) as PendingAction)
  }

  async upsert(action: PendingAction): Promise<void> {
    await (await db()).execute(
      `INSERT INTO queue (id, game_id, type, created_at, state, next_attempt_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state, next_attempt_at = excluded.next_attempt_at, payload = excluded.payload`,
      [action.id, action.gameId, action.type, action.createdAt, action.state, action.nextAttemptAt, JSON.stringify(action)],
    )
  }

  async remove(id: string): Promise<void> {
    await (await db()).execute('DELETE FROM queue WHERE id = $1', [id])
  }
}
