import { ApiError } from './errors'
import type { HttpClient } from './http'
import type { OperatorAuthResponse, PlayerAuthResponse, EntityId, GameStatus } from './types'

/** What the app persists. Player tokens are long-lived JWTs; operators hold a refresh token. */
export type StoredAuth =
  | {
      kind: 'player'
      token: string
      playerId: EntityId
      teamId: EntityId
      gameId: EntityId
      displayName: string
      teamName: string
      teamColor: string
      gameName: string
      gameStatus: GameStatus
      tileSource?: string | null
    }
  | {
      kind: 'operator'
      accessToken: string
      refreshToken: string
      userId: EntityId
      userName: string
      email: string
      role: string
    }

export interface TokenStore {
  load(): Promise<StoredAuth | null>
  save(auth: StoredAuth): Promise<void>
  clear(): Promise<void>
}

export type AuthState = { kind: 'none' } | StoredAuth

export interface AuthSessionOptions {
  store: TokenStore
  /** Unauthenticated client used only for the refresh call. */
  http: HttpClient
  /** Called when the session became permanently invalid. The store is already cleared. */
  onLogout?: (reason: 'refresh_rejected' | 'explicit' | 'server_revoked') => void
  /** Refresh this many seconds before expiry. */
  refreshMarginSeconds?: number
  now?: () => number
}

/**
 * Owns the session for both roles and hands out a valid bearer token.
 *
 * Operator access tokens live 15 minutes; this refreshes them proactively
 * and deduplicates concurrent refreshes so the backend never sees a
 * rotated refresh token twice. A rejected refresh logs the operator out.
 * Player tokens are used as-is until the backend rejects them.
 */
export class AuthSession {
  private state: AuthState = { kind: 'none' }
  private loaded = false
  private restorePromise: Promise<AuthState> | null = null
  private revision = 0
  private writes: Promise<void> = Promise.resolve()
  private refreshPromise: Promise<string> | null = null
  private readonly listeners = new Set<(s: AuthState) => void>()
  private readonly now: () => number
  private readonly margin: number

  constructor(private readonly options: AuthSessionOptions) {
    this.now = options.now ?? (() => Date.now())
    this.margin = options.refreshMarginSeconds ?? 60
  }

  /** Load persisted state. Safe to call more than once. */
  async restore(): Promise<AuthState> {
    if (this.loaded) return this.state
    if (!this.restorePromise) {
      const revision = this.revision
      this.restorePromise = (async () => {
        const stored = await this.options.store.load()
        if (revision === this.revision) {
          this.state = stored ?? { kind: 'none' }
          this.loaded = true
          this.emit()
        }
        return this.state
      })().finally(() => { this.restorePromise = null })
    }
    return this.restorePromise
  }

  get current(): AuthState {
    return this.state
  }

  subscribe(listener: (s: AuthState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async setPlayer(auth: PlayerAuthResponse): Promise<void> {
    this.revision++
    this.refreshPromise = null
    await this.persist({
      kind: 'player',
      token: auth.token,
      playerId: auth.player.id,
      teamId: auth.team.id,
      gameId: auth.game.id,
      displayName: auth.player.displayName,
      teamName: auth.team.name,
      teamColor: auth.team.color,
      gameName: auth.game.name,
      gameStatus: auth.game.status,
      tileSource: auth.game.tileSource ?? null,
    })
  }

  async setOperator(auth: OperatorAuthResponse): Promise<void> {
    this.revision++
    this.refreshPromise = null
    await this.persist({
      kind: 'operator',
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      userId: auth.user.id,
      userName: auth.user.name,
      email: auth.user.email,
      role: auth.user.role,
    })
  }

  /** Update cached player-facing game facts (status, names) without touching the token. */
  async updatePlayerFacts(patch: Partial<Pick<Extract<StoredAuth, { kind: 'player' }>, 'gameStatus' | 'gameName' | 'teamName' | 'teamColor' | 'displayName'>>): Promise<void> {
    if (this.state.kind !== 'player') return
    await this.persist({ ...this.state, ...patch })
  }

  async logout(reason: 'explicit' | 'server_revoked' | 'refresh_rejected' = 'explicit'): Promise<void> {
    this.revision++
    this.loaded = true
    this.state = { kind: 'none' }
    this.refreshPromise = null
    this.emit()
    await this.write(() => this.options.store.clear())
    this.options.onLogout?.(reason)
  }

  /**
   * A bearer token that is valid right now, refreshing first when needed.
   * Returns null when there is no session. Throws ApiError on a transient
   * refresh failure so the caller can retry later instead of sending a
   * request that will fail anyway.
   */
  async getToken(): Promise<string | null> {
    await this.restore()
    const s = this.state
    if (s.kind === 'none') return null
    if (s.kind === 'player') return s.token
    if (!isExpiringSoon(s.accessToken, this.margin, this.now())) return s.accessToken
    return this.refresh()
  }

  /**
   * Force a refresh. Used after a 401 on a request whose token looked valid.
   * Returns the new access token, or null if the session is gone.
   */
  async refreshAfterRejection(): Promise<string | null> {
    if (this.state.kind !== 'operator') {
      if (this.state.kind === 'player') {
        // Player tokens cannot be refreshed. A rejection means the session is dead.
        await this.logout('server_revoked')
      }
      return null
    }
    try {
      return await this.refresh()
    } catch (e) {
      if (e instanceof ApiError && !e.retryable) return null
      throw e
    }
  }

  private refresh(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise
    const revision = this.revision
    this.refreshPromise = (async () => {
      try {
        const s = this.state
        if (s.kind !== 'operator') throw new ApiError({ status: 0, message: 'No operator session', code: 'UNAUTHENTICATED' })
        let res: OperatorAuthResponse
        try {
          res = await this.options.http.post<OperatorAuthResponse>(
            '/api/auth/refresh',
            { refreshToken: s.refreshToken },
            { anonymous: true, timeoutMs: 10_000 },
          )
        } catch (e) {
          // 400/401/403 mean the refresh token itself is dead.
          if (e instanceof ApiError && (e.status === 400 || e.status === 401 || e.status === 403)) {
            if (revision === this.revision) await this.logout('refresh_rejected')
            throw new ApiError({ status: e.status, message: 'Session expired', code: 'UNAUTHENTICATED', cause: e })
          }
          throw e
        }
        if (!res?.accessToken || !res.refreshToken) {
          throw new ApiError({ status: 0, message: 'Invalid refresh response', code: 'INVALID_RESPONSE' })
        }
        if (revision !== this.revision) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED', message: 'Session changed during refresh' })
        await this.persist({ ...s, accessToken: res.accessToken, refreshToken: res.refreshToken }, revision)
        if (revision !== this.revision) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED', message: 'Session changed during refresh' })
        return res.accessToken
      } finally {
        if (revision === this.revision) this.refreshPromise = null
      }
    })()
    return this.refreshPromise
  }

  private async persist(next: StoredAuth, revision = this.revision): Promise<void> {
    await this.write(async () => {
      if (revision !== this.revision) return
      await this.options.store.save(next)
      if (revision !== this.revision) return
      this.state = next
      this.loaded = true
      this.emit()
    })
  }

  private write(operation: () => Promise<void>): Promise<void> {
    const result = this.writes.then(operation)
    this.writes = result.catch(() => {})
    return result
  }

  private emit() {
    for (const l of this.listeners) l(this.state)
  }
}

/** True when the JWT has expired or will within `marginSeconds`. Unparseable tokens count as expiring. */
export function isExpiringSoon(token: string, marginSeconds: number, nowMs: number): boolean {
  const exp = jwtExpiry(token)
  if (exp === null) return true
  return exp - marginSeconds <= nowMs / 1000
}

/** The `exp` claim in seconds, or null if the token cannot be decoded. */
export function jwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown }
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** In-memory store for tests and for desktop development runs. */
export class MemoryTokenStore implements TokenStore {
  private value: StoredAuth | null = null
  async load() {
    return this.value
  }
  async save(auth: StoredAuth) {
    this.value = auth
  }
  async clear() {
    this.value = null
  }
}
