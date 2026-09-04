import { db } from './db'

/** Small, non-secret settings (language, last opened game). Secrets go to the secure store. */
export const kv = {
  async get(key: string): Promise<string | null> {
    const rows = await (await db()).select<{ value: string }[]>('SELECT value FROM kv WHERE key = $1', [key])
    return rows[0]?.value ?? null
  },
  async set(key: string, value: string): Promise<void> {
    await (await db()).execute('INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
  },
  async remove(key: string): Promise<void> {
    await (await db()).execute('DELETE FROM kv WHERE key = $1', [key])
  },
}
