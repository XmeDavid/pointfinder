import type { RealtimeSocket, SocketFactory } from '@pointfinder/api'
import WebSocket from '@tauri-apps/plugin-websocket'

/**
 * Realtime over the Tauri websocket plugin. The Rust side owns the connection, which is
 * what lets us send the `Authorization` header the backend insists on (browsers can't).
 */
export const tauriSocketFactory: SocketFactory = async (url, headers) => {
  const ws = await WebSocket.connect(url, { headers })
  let onMessage: (text: string) => void = () => {}
  let onClose: (reason?: string) => void = () => {}
  let onError: (error: unknown) => void = () => {}
  let closed = false

  ws.addListener((msg) => {
    if (msg.type === 'Text') onMessage(msg.data)
    else if (msg.type === 'Close') {
      if (closed) return
      closed = true
      onClose(msg.data?.reason ?? undefined)
    }
  })

  const socket: RealtimeSocket = {
    send: (text) => ws.send(text).catch(onError),
    close: async () => {
      if (closed) return
      closed = true
      await ws.disconnect().catch(() => {})
      onClose('client')
    },
    onMessage: (cb) => { onMessage = cb },
    onClose: (cb) => { onClose = cb },
    onError: (cb) => { onError = cb },
  }
  return socket
}

/** Browser fallback: native WebSocket, token passed as a query param since headers are impossible. */
export const browserSocketFactory: SocketFactory = async (url, headers) => {
  const u = new URL(url)
  const auth = headers.Authorization ?? headers.authorization
  if (auth?.startsWith('Bearer ')) u.searchParams.set('token', auth.slice(7))
  const ws = new globalThis.WebSocket(u.toString())
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = (e) => reject(e)
  })
  let onClose: (reason?: string) => void = () => {}
  const socket: RealtimeSocket = {
    send: (text) => ws.send(text),
    close: () => ws.close(),
    onMessage: (cb) => { ws.onmessage = (e) => cb(String(e.data)) },
    onClose: (cb) => { onClose = cb; ws.onclose = (e) => onClose(e.reason) },
    onError: (cb) => { ws.onerror = (e) => cb(e) },
  }
  return socket
}
