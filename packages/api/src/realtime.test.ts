import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeClient, reconnectDelayMs, type RealtimeSocket } from './realtime'

class FakeSocket implements RealtimeSocket {
  sent: string[] = []
  closed = false
  private msg: ((t: string) => void) | null = null
  private closeCb: ((r?: string) => void) | null = null
  private errCb: ((e: unknown) => void) | null = null
  send(text: string) {
    this.sent.push(text)
  }
  close() {
    this.closed = true
  }
  onMessage(cb: (t: string) => void) {
    this.msg = cb
  }
  onClose(cb: (r?: string) => void) {
    this.closeCb = cb
  }
  onError(cb: (e: unknown) => void) {
    this.errCb = cb
  }
  emit(obj: unknown) {
    this.msg?.(typeof obj === 'string' ? obj : JSON.stringify(obj))
  }
  drop() {
    this.closeCb?.('gone')
  }
  fail() {
    this.errCb?.(new Error('boom'))
  }
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('reconnectDelayMs', () => {
  it('doubles from one second and caps', () => {
    expect(reconnectDelayMs(1)).toBe(1000)
    expect(reconnectDelayMs(2)).toBe(2000)
    expect(reconnectDelayMs(5)).toBe(16000)
    expect(reconnectDelayMs(9)).toBe(30000)
  })
})

describe('RealtimeClient', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function make(tokens: (string | null)[] = ['tok']) {
    const sockets: FakeSocket[] = []
    const urls: string[] = []
    const headers: Record<string, string>[] = []
    let i = 0
    const client = new RealtimeClient({
      baseUrl: 'https://api.test',
      getToken: async () => tokens[Math.min(i++, tokens.length - 1)] ?? null,
      socketFactory: async (url, h) => {
        urls.push(url)
        headers.push(h)
        const s = new FakeSocket()
        sockets.push(s)
        return s
      },
    })
    return { client, sockets, urls, headers }
  }

  it('connects with a bearer header to the mobile socket URL', async () => {
    const { client, urls, headers } = make()
    client.connect('g1')
    await flush()
    expect(urls[0]).toBe('wss://api.test/ws/mobile?gameId=g1')
    expect(headers[0]).toEqual({ Authorization: 'Bearer tok' })
    expect(client.state.kind).toBe('connected')
  })

  it('delivers parsed envelopes and tracks the highest state version', async () => {
    const { client, sockets } = make()
    const seen: string[] = []
    client.onEvent((e) => seen.push(e.type))
    client.connect('g1')
    await flush()
    sockets[0]!.emit({ version: 1, type: 'game_status', stateVersion: 7, data: { status: 'live' } })
    sockets[0]!.emit({ version: 1, type: 'location', data: {} })
    sockets[0]!.emit({ version: 1, type: 'activity', stateVersion: 5 })
    sockets[0]!.emit('not json')
    expect(seen).toEqual(['game_status', 'location', 'activity'])
    expect(client.lastSeenStateVersion).toBe(7)
  })

  it('reconnects with backoff after a drop and fires onReconnect', async () => {
    const { client, sockets } = make(['t1', 't2'])
    const reconnects = vi.fn()
    client.onReconnect(reconnects)
    client.connect('g1')
    await flush()
    sockets[0]!.drop()
    expect(client.state).toEqual({ kind: 'reconnecting', attempt: 1, inMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(sockets).toHaveLength(2)
    expect(client.state.kind).toBe('connected')
    expect(reconnects).toHaveBeenCalledTimes(1)
  })

  it('backs off further on repeated failures and asks for a fresh token each time', async () => {
    let calls = 0
    const client = new RealtimeClient({
      baseUrl: 'https://api.test',
      getToken: async () => `t${++calls}`,
      socketFactory: async () => {
        throw new Error('refused')
      },
    })
    client.connect('g1')
    await flush()
    expect(client.state).toEqual({ kind: 'reconnecting', attempt: 1, inMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(client.state).toEqual({ kind: 'reconnecting', attempt: 2, inMs: 2000 })
    expect(calls).toBe(2)
  })

  it('stops everything on disconnect and ignores late socket callbacks', async () => {
    const { client, sockets } = make()
    client.connect('g1')
    await flush()
    const s = sockets[0]!
    client.disconnect()
    expect(s.closed).toBe(true)
    expect(client.state.kind).toBe('disconnected')
    s.drop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(sockets).toHaveLength(1)
  })

  it('ensureConnected reopens immediately while waiting on backoff', async () => {
    const { client, sockets } = make()
    client.connect('g1')
    await flush()
    sockets[0]!.fail()
    expect(client.state.kind).toBe('reconnecting')
    client.ensureConnected()
    await flush()
    expect(sockets).toHaveLength(2)
    expect(client.state.kind).toBe('connected')
  })
})
