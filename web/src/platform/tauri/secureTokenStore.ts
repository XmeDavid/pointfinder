import type { StoredAuth, TokenStore } from '@pointfinder/api'
import * as secure from 'tauri-plugin-pointfinder-secure-store-api'

const KEY = 'auth'

/** Persists the session in the Keychain / Android Keystore through our secure-store plugin. */
export class SecureTokenStore implements TokenStore {
  async load(): Promise<StoredAuth | null> {
    const raw = await secure.get(KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as StoredAuth
      return parsed && (parsed.kind === 'player' || parsed.kind === 'operator') ? parsed : null
    } catch {
      await secure.remove(KEY)
      return null
    }
  }

  async save(auth: StoredAuth): Promise<void> {
    await secure.set(KEY, JSON.stringify(auth))
  }

  async clear(): Promise<void> {
    await secure.remove(KEY)
  }
}
