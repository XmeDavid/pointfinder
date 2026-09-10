import { AuthSession, HttpClient, createApi, type AuthState, type OperatorAuthResponse, type PointFinderApi, type StoredAuth, type TokenStore } from '@pointfinder/api'
import type { KeyValueStore } from '@/platform/contracts'

const KEY = 'account'

/**
 * The account session lives next to the player session and never touches the
 * operator store, so an account signed into the player app never routes the
 * phone into operator mode. Stored under its own secret key.
 */
export class AccountTokenStore implements TokenStore {
  constructor(private readonly secrets: KeyValueStore) {}
  async load(): Promise<StoredAuth | null> {
    const raw = await this.secrets.get(KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as StoredAuth
      return parsed && parsed.kind === 'operator' ? parsed : null
    } catch {
      await this.secrets.remove(KEY).catch(() => {})
      return null
    }
  }
  async save(auth: StoredAuth): Promise<void> {
    if (auth.kind !== 'operator') throw new Error('The account store holds user sessions only')
    await this.secrets.set(KEY, JSON.stringify(auth))
  }
  async clear(): Promise<void> {
    await this.secrets.remove(KEY)
  }
}

export interface AccountServices {
  session: AuthSession
  /** Calls made as the account (bearer: the account access token), refreshed like an operator's. */
  api: PointFinderApi
  /** Sign in with credentials; the pair is kept until sign-out or 30 days of inactivity. */
  signIn: (email: string, password: string) => Promise<OperatorAuthResponse>
  /** Create a participant account and keep it signed in. */
  register: (email: string, name: string, password: string, deviceId: string) => Promise<OperatorAuthResponse>
  signOut: () => Promise<void>
  /** The current access token, refreshed if needed; null when signed out. */
  accessToken: () => Promise<string | null>
}

export function createAccountServices(options: { baseUrl: string; fetch: typeof fetch; secrets: KeyValueStore }): AccountServices {
  const anonymous = new HttpClient({ baseUrl: options.baseUrl, fetch: options.fetch })
  const session = new AuthSession({ store: new AccountTokenStore(options.secrets), http: anonymous })
  const http = new HttpClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    getToken: () => session.getToken(),
    onUnauthorized: async (_error, rejectedToken) => {
      const auth = session.current
      if (auth.kind !== 'operator' || !rejectedToken || rejectedToken !== auth.accessToken) return false
      return (await session.refreshAfterRejection()) !== null
    },
  })
  const api = createApi(http)
  const anonymousApi = createApi(anonymous)
  return {
    session,
    api,
    signIn: async (email, password) => {
      const res = await anonymousApi.auth.operatorLogin({ email, password })
      await session.setOperator(res)
      return res
    },
    register: async (email, name, password, deviceId) => {
      const res = await anonymousApi.auth.participantRegister({ email, name, password, deviceId })
      await session.setOperator(res)
      return res
    },
    signOut: async () => {
      const auth = session.current
      if (auth.kind === 'operator') await anonymousApi.auth.logout(auth.refreshToken).catch(() => {})
      await session.logout()
    },
    accessToken: () => session.getToken().catch(() => null),
  }
}

export type AccountState = AuthState
