import { describe, expect, it, vi } from 'vitest'
import { AuthSession, MemoryTokenStore, isExpiringSoon, jwtExpiry } from './auth'
import { HttpClient } from './http'
import { ApiError } from './errors'

function jwt(expSeconds: number): string {
  const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify({ sub: 'u1', exp: expSeconds }))}.sig`
}

const operatorAuth = (access: string) => ({
  accessToken: access,
  refreshToken: 'r1',
  user: { id: 'u1', name: 'Op', email: 'op@x', role: 'operator' as const },
})

function sessionWith(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, nowMs = 1_000_000_000) {
  const store = new MemoryTokenStore()
  const onLogout = vi.fn()
  const http = new HttpClient({ baseUrl: 'https://api.test', fetch: fetchImpl as never })
  const session = new AuthSession({ store, http, onLogout, now: () => nowMs })
  return { session, store, onLogout }
}

describe('jwt helpers', () => {
  it('reads exp and flags expiry within the margin', () => {
    const now = 1_000_000_000
    expect(jwtExpiry(jwt(123))).toBe(123)
    expect(jwtExpiry('garbage')).toBeNull()
    expect(isExpiringSoon(jwt(now / 1000 + 120), 60, now)).toBe(false)
    expect(isExpiringSoon(jwt(now / 1000 + 30), 60, now)).toBe(true)
    expect(isExpiringSoon('garbage', 60, now)).toBe(true)
  })
})

describe('AuthSession', () => {
  it('returns the player token as-is', async () => {
    const { session } = sessionWith(async () => new Response(null, { status: 500 }))
    await session.setPlayer({
      token: 'ptok',
      player: { id: 'p', displayName: 'D', deviceId: 'd' },
      team: { id: 't', name: 'T', color: '#000' },
      game: { id: 'g', name: 'G', description: '', status: 'live' },
    })
    expect(await session.getToken()).toBe('ptok')
    expect(session.current.kind).toBe('player')
  })

  it('refreshes an expiring operator token once for concurrent callers', async () => {
    const now = 1_000_000_000
    let refreshCalls = 0
    const fresh = jwt(now / 1000 + 900)
    const { session, store } = sessionWith(async (url) => {
      expect(url).toBe('https://api.test/api/auth/refresh')
      refreshCalls++
      await new Promise((r) => setTimeout(r, 5))
      return new Response(JSON.stringify(operatorAuth(fresh)), { status: 200, headers: { 'content-type': 'application/json' } })
    }, now)
    await session.setOperator(operatorAuth(jwt(now / 1000 + 10)))
    const [a, b, c] = await Promise.all([session.getToken(), session.getToken(), session.getToken()])
    expect(a).toBe(fresh)
    expect(b).toBe(fresh)
    expect(c).toBe(fresh)
    expect(refreshCalls).toBe(1)
    const stored = await store.load()
    expect(stored?.kind === 'operator' && stored.accessToken).toBe(fresh)
  })

  it('does not refresh a token that is still valid', async () => {
    const now = 1_000_000_000
    const fetchMock = vi.fn()
    const { session } = sessionWith(fetchMock as never, now)
    const access = jwt(now / 1000 + 600)
    await session.setOperator(operatorAuth(access))
    expect(await session.getToken()).toBe(access)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('logs out when the refresh token is rejected', async () => {
    const now = 1_000_000_000
    const { session, store, onLogout } = sessionWith(
      async () => new Response(JSON.stringify({ message: 'bad' }), { status: 401, headers: { 'content-type': 'application/json' } }),
      now,
    )
    await session.setOperator(operatorAuth(jwt(now / 1000 + 10)))
    const err = (await session.getToken().catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('UNAUTHENTICATED')
    expect(session.current.kind).toBe('none')
    expect(await store.load()).toBeNull()
    expect(onLogout).toHaveBeenCalledWith('refresh_rejected')
  })

  it('keeps the session on a transient refresh failure', async () => {
    const now = 1_000_000_000
    const { session, onLogout } = sessionWith(async () => new Response(null, { status: 503 }), now)
    await session.setOperator(operatorAuth(jwt(now / 1000 + 10)))
    const err = (await session.getToken().catch((e) => e)) as ApiError
    expect(err.retryable).toBe(true)
    expect(session.current.kind).toBe('operator')
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('restores persisted state and notifies subscribers', async () => {
    const store = new MemoryTokenStore()
    await store.save({ kind: 'operator', accessToken: 'a', refreshToken: 'r', userId: 'u', userName: 'n', email: 'e', role: 'operator' })
    const session = new AuthSession({ store, http: new HttpClient({ baseUrl: 'https://api.test', fetch: vi.fn() as never }) })
    const seen: string[] = []
    session.subscribe((s) => seen.push(s.kind))
    expect((await session.restore()).kind).toBe('operator')
    await session.logout()
    expect(seen).toEqual(['operator', 'none'])
  })
})

describe('session changes during asynchronous restoration and refresh', () => {
  it.each([200, 401])('does not restore or clear a newer login when old refresh returns %s', async (status) => {
    let finish!: (response: Response) => void
    let onStarted!: () => void
    const started = new Promise<void>((resolve) => { onStarted = resolve })
    const fetchRefresh = () => { onStarted(); return new Promise<Response>((resolve) => { finish = resolve }) }
    // The fetch starts only once getToken is called below.
    const { session, store } = sessionWith(() => fetchRefresh())
    await session.setOperator(operatorAuth(jwt(0)))
    const pending = session.getToken().catch((error) => error)
    await started
    await session.setOperator({ ...operatorAuth(jwt(9_999_999)), user: { id: 'other', name: 'Other', email: 'other@x', role: 'operator' } })
    finish(new Response(JSON.stringify(status === 200 ? operatorAuth(jwt(9_999_998)) : { message: 'Rejected' }), { status, headers: { 'content-type': 'application/json' } }))
    await pending
    expect(session.current).toMatchObject({ kind: 'operator', userId: 'other' })
    expect(await store.load()).toMatchObject({ kind: 'operator', userId: 'other' })
  })
})
