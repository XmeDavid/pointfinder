import { describe, expect, it, vi } from 'vitest'
import { HttpClient } from './http'
import { ApiError } from './errors'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('HttpClient', () => {
  it('sends JSON with a bearer token and parses JSON back', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.test/api/games?limit=5')
      expect(init.method).toBe('POST')
      const headers = init.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer tok')
      expect(headers['Content-Type']).toBe('application/json')
      expect(init.body).toBe(JSON.stringify({ name: 'x' }))
      return jsonResponse(201, { id: '1' })
    })
    const http = new HttpClient({ baseUrl: 'https://api.test/', fetch: fetchMock as never, getToken: async () => 'tok' })
    const out = await http.post<{ id: string }>('/api/games', { name: 'x' }, { query: { limit: 5, skip: undefined } })
    expect(out).toEqual({ id: '1' })
  })

  it('maps backend error bodies to ApiError with code and field errors', async () => {
    const http = new HttpClient({
      baseUrl: 'https://api.test',
      fetch: (async () =>
        jsonResponse(400, { status: 400, message: 'Validation failed', code: 'TAG_LABEL_DUPLICATE', errors: { label: 'taken' } })) as never,
    })
    const err = (await http.get('/api/x').catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.code).toBe('TAG_LABEL_DUPLICATE')
    expect(err.fieldErrors).toEqual({ label: 'taken' })
    expect(err.retryable).toBe(false)
  })

  it('returns undefined for 204 and text for non-JSON bodies', async () => {
    const http = new HttpClient({
      baseUrl: 'https://api.test',
      fetch: vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response('plain', { status: 200, headers: { 'content-type': 'text/plain' } })) as never,
    })
    expect(await http.delete('/api/x')).toBeUndefined()
    expect(await http.get('/api/y')).toBe('plain')
  })

  it('classifies network failures as retryable NETWORK errors', async () => {
    const http = new HttpClient({ baseUrl: 'https://api.test', fetch: (async () => { throw new TypeError('offline') }) as never })
    const err = (await http.get('/api/x').catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('NETWORK')
    expect(err.status).toBe(0)
    expect(err.retryable).toBe(true)
  })

  it('times out and reports TIMEOUT', async () => {
    const http = new HttpClient({
      baseUrl: 'https://api.test',
      fetch: ((_: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })) as never,
    })
    const err = (await http.get('/api/slow', { timeoutMs: 10 }).catch((e) => e)) as ApiError
    expect(err.code).toBe('TIMEOUT')
  })

  it('retries once after a 401 when onUnauthorized says so', async () => {
    let calls = 0
    const http = new HttpClient({
      baseUrl: 'https://api.test',
      fetch: (async () => {
        calls++
        return calls === 1 ? jsonResponse(401, { message: 'expired' }) : jsonResponse(200, { ok: true })
      }) as never,
      getToken: async () => (calls === 0 ? 'old' : 'new'),
      onUnauthorized: async () => true,
    })
    expect(await http.get('/api/me')).toEqual({ ok: true })
    expect(calls).toBe(2)
  })

  it('does not retry a 401 when onUnauthorized declines', async () => {
    let calls = 0
    const http = new HttpClient({
      baseUrl: 'https://api.test',
      fetch: (async () => {
        calls++
        return jsonResponse(401, { message: 'expired' })
      }) as never,
      onUnauthorized: async () => false,
    })
    const err = (await http.get('/api/me').catch((e) => e)) as ApiError
    expect(err.status).toBe(401)
    expect(err.isAuth).toBe(true)
    expect(calls).toBe(1)
  })
})
