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
