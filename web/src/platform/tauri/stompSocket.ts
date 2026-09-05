import type { IStompSocket } from '@stomp/stompjs'
import WebSocket from '@tauri-apps/plugin-websocket'

/** WebSocket shape expected by STOMP, backed by Tauri's native transport. */
export function createStompSocket(url: string, headers: Record<string, string>): IStompSocket {
  let state = 0
  let connection: WebSocket | undefined
  const close = () => {
    if (state === 3) return
    state = 3
    if (connection) void connection.disconnect().catch(() => {})
    socket.onclose?.({ code: 1000, reason: 'closed' })
  }
  const socket: IStompSocket = {
    url, onopen: null, onclose: null, onerror: null, onmessage: null,
    get readyState() { return state },
    close,
    send(data) {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer)
      void connection?.send(text).catch((error) => { socket.onerror?.(error); close() })
    },
  }
  void WebSocket.connect(url, { headers }).then((ws) => {
    if (state === 3) { void ws.disconnect(); return }
    connection = ws
    ws.addListener((event) => {
      if (event.type === 'Text') socket.onmessage?.({ data: event.data })
      if (event.type === 'Binary') socket.onmessage?.({ data: new Uint8Array(event.data).buffer })
      if (event.type === 'Close') close()
    })
    state = 1
    socket.onopen?.()
  }).catch((error) => { socket.onerror?.(error); close() })
  return socket
}
