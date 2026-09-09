import { secrets } from '@/platform'

const KEY = 'deviceId'

/** Stable per-install id the backend uses to keep a player attached to their team. */
export async function getDeviceId(): Promise<string> {
  const existing = await secrets.get(KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  await secrets.set(KEY, id)
  return id
}
