import * as secure from 'tauri-plugin-pointfinder-secure-store-api'
import { isNative } from '../platform'

const KEY = 'deviceId'

/** Stable per-install id the backend uses to keep a player attached to their team. */
export async function getDeviceId(): Promise<string> {
  if (isNative()) {
    const existing = await secure.get(KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    await secure.set(KEY, id)
    return id
  }
  const existing = localStorage.getItem(`pf.${KEY}`)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(`pf.${KEY}`, id)
  return id
}
