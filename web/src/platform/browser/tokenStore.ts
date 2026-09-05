import type { StoredAuth, TokenStore } from '@pointfinder/api'

/** Player credentials only. Operator refresh tokens remain in HttpOnly cookies. */
export class BrowserTokenStore implements TokenStore {
  async load(): Promise<StoredAuth | null> {
    const raw = localStorage.getItem('pf.auth')
    if (!raw) return null
    try {
      const auth = JSON.parse(raw) as StoredAuth
      return auth.kind === 'player' ? auth : null
    } catch { return null }
  }
  async save(auth: StoredAuth) {
    if (auth.kind !== 'player') throw new Error('Browser operator sessions use HttpOnly cookies')
    localStorage.setItem('pf.auth', JSON.stringify(auth))
  }
  async clear() { localStorage.removeItem('pf.auth') }
}
