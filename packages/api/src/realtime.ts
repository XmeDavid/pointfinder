import type { EntityId, RealtimeEnvelope } from './types'

/** The minimum a WebSocket implementation must offer. Browser sockets and the Tauri plugin both fit. */
export interface RealtimeSocket {
  send(text: string): void | Promise<void>
  close(): void | Promise<void>
  onMessage(cb: (text: string) => void): void
  onClose(cb: (reason?: string) => void): void
  onError(cb: (error: unknown) => void): void
}

/**
 * Opens a socket to `url` with `headers`. The backend authenticates the
 * handshake with an Authorization header, which browser sockets cannot
 * set, so the app supplies a factory backed by the Tauri websocket plugin.
 */
export type SocketFactory = (url: string, headers: Record<string, string>) => Promise<RealtimeSocket>

export type RealtimeState =
  | { kind: 'disconnected' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'reconnecting'; attempt: number; inMs: number }

export interface RealtimeClientOptions {
  /** e.g. "https://pointfinder.pt". Converted to wss automatically. */
  baseUrl: string
  socketFactory: SocketFactory
  /** Fresh token on every (re)connect so operators survive the 15 minute access-token life. */
  getToken: () => Promise<string | null>
  /** Upper bound of the backoff in milliseconds. */
  maxBackoffMs?: number
  setTimeout?: typeof globalThis.setTimeout
  clearTimeout?: typeof globalThis.clearTimeout
}

/**
 * Game-scoped realtime client with reconnect and state-version tracking.
 *
 * Realtime is invalidation, the snapshot is canonical: callers watch
 * `lastSeenStateVersion`, and on foreground or reconnect compare it with
 * `GET /api/games/{id}/snapshot`.
 */
export class RealtimeClient {
  private socket: RealtimeSocket | null = null
  private desiredGameId: EntityId | null = null
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private stateValue: RealtimeState = { kind: 'disconnected' }
  private readonly eventListeners = new Set<(e: RealtimeEnvelope) => void>()
  private readonly stateListeners = new Set<(s: RealtimeState) => void>()
  private readonly reconnectListeners = new Set<() => void>()
  private hasConnectedOnce = false
  lastSeenStateVersion: number | null = null

  private readonly setTimer: typeof globalThis.setTimeout
  private readonly clearTimer: typeof globalThis.clearTimeout

  constructor(private readonly options: RealtimeClientOptions) {
    this.setTimer = options.setTimeout ?? globalThis.setTimeout.bind(globalThis)
    this.clearTimer = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis)
  }

  get state(): RealtimeState {
    return this.stateValue
  }

  onEvent(listener: (e: RealtimeEnvelope) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onState(listener: (s: RealtimeState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  /** Fires on every successful connection after the first. Callers refetch the snapshot here. */
  onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener)
    return () => this.reconnectListeners.delete(listener)
  }

  /** Start and keep a connection for this game until `disconnect()`. */
  connect(gameId: EntityId): void {
    if (this.desiredGameId === gameId && (this.socket || this.reconnectTimer)) return
    this.disconnect()
    this.desiredGameId = gameId
    this.attempt = 0
    void this.open()
  }

  disconnect(): void {
    this.desiredGameId = null
    this.generation++
    if (this.reconnectTimer) {
      this.clearTimer(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const s = this.socket
    this.socket = null
    if (s) void s.close()
    this.setState({ kind: 'disconnected' })
  }

  /** Call on app foreground: reconnects immediately if the socket is down. */
  ensureConnected(): void {
    if (!this.desiredGameId) return
    if (this.socket) return
    if (this.reconnectTimer) {
      this.clearTimer(this.reconnectTimer)
      this.reconnectTimer = null
    }
    void this.open()
  }

  buildUrl(gameId: EntityId): string {
    const base = this.options.baseUrl.replace(/\/+$/, '').replace(/^http/, 'ws')
    return `${base}/ws/mobile?gameId=${encodeURIComponent(gameId)}`
  }

  private async open(): Promise<void> {
    const gameId = this.desiredGameId
    if (!gameId) return
    const gen = ++this.generation
    this.setState(this.attempt === 0 ? { kind: 'connecting' } : { kind: 'reconnecting', attempt: this.attempt, inMs: 0 })

    let token: string | null = null
    try {
      token = await this.options.getToken()
    } catch {
      token = null
    }
    if (gen !== this.generation) return
    if (!token) {
      this.scheduleReconnect()
      return
    }

    let socket: RealtimeSocket
    try {
      socket = await this.options.socketFactory(this.buildUrl(gameId), { Authorization: `Bearer ${token}` })
    } catch {
      if (gen !== this.generation) return
      this.scheduleReconnect()
      return
    }
    if (gen !== this.generation) {
      void socket.close()
      return
    }

    this.socket = socket
    const wasReconnect = this.hasConnectedOnce
    this.hasConnectedOnce = true
    this.attempt = 0
    this.setState({ kind: 'connected' })
    if (wasReconnect) for (const l of this.reconnectListeners) l()

    socket.onMessage((text) => {
      if (gen !== this.generation) return
      this.handleMessage(text)
    })
    const onDrop = () => {
      if (gen !== this.generation) return
      this.socket = null
      this.scheduleReconnect()
    }
    socket.onClose(onDrop)
    socket.onError(onDrop)
  }

  private handleMessage(text: string) {
    let envelope: RealtimeEnvelope
    try {
      envelope = JSON.parse(text) as RealtimeEnvelope
    } catch {
      return
    }
    if (!envelope || typeof envelope !== 'object' || typeof envelope.type !== 'string') return
    if (typeof envelope.stateVersion === 'number') {
      this.lastSeenStateVersion = Math.max(this.lastSeenStateVersion ?? 0, envelope.stateVersion)
    }
    for (const l of this.eventListeners) l(envelope)
  }

  private scheduleReconnect() {
    if (!this.desiredGameId) return
    if (this.reconnectTimer) return
    this.attempt += 1
    const cap = this.options.maxBackoffMs ?? 30_000
    const delay = Math.min(cap, 1000 * 2 ** Math.min(this.attempt - 1, 10))
    this.setState({ kind: 'reconnecting', attempt: this.attempt, inMs: delay })
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null
      void this.open()
    }, delay)
  }

  private setState(s: RealtimeState) {
    this.stateValue = s
    for (const l of this.stateListeners) l(s)
  }
}

/** Reconnect delay for a given attempt (1-based): 1s, 2s, 4s ... capped. Exposed for tests and UI copy. */
export function reconnectDelayMs(attempt: number, capMs = 30_000): number {
  return Math.min(capMs, 1000 * 2 ** Math.min(Math.max(attempt, 1) - 1, 10))
}
