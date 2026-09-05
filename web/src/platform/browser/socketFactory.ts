import { Client } from '@stomp/stompjs'
import type { RealtimeSocket, SocketFactory } from '@pointfinder/api'
import { brokerUrl } from '../config'

/** Browsers authenticate STOMP CONNECT; the raw mobile endpoint requires HTTP headers. */
export const browserSocketFactory: SocketFactory = async (url, headers) => {
  const gameId = new URL(url).searchParams.get('gameId')
  if (!gameId) throw new Error('Game is required for realtime')
  const token = (headers.Authorization ?? '').replace(/^Bearer /, '')
  const encoded = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
  const claims = encoded ? JSON.parse(atob(encoded)) as { teamId?: string } : {}
  let onMessage: (text: string) => void = () => {}
  let onClose: () => void = () => {}
  let onError: (error: unknown) => void = () => {}
  const client = new Client({ brokerURL: brokerUrl(), connectHeaders: headers, reconnectDelay: 0, connectionTimeout: 10_000, heartbeatIncoming: 10_000, heartbeatOutgoing: 10_000 })
  await new Promise<void>((resolve, reject) => {
    client.onConnect = () => {
      client.subscribe(`/topic/games/${gameId}`, (message) => onMessage(message.body))
      if (claims.teamId) client.subscribe(`/topic/games/${gameId}/team/${claims.teamId}/submission_status`, (message) => onMessage(message.body))
      resolve()
    }
    client.onWebSocketClose = () => { reject(new Error('Realtime connection closed')); onClose() }
    client.onWebSocketError = (error) => { reject(error); onError(error) }
    client.onStompError = (frame) => { reject(new Error(frame.headers.message)); onError(frame); void client.deactivate() }
    client.activate()
  }).catch((error) => { void client.deactivate(); throw error })
  const socket: RealtimeSocket = {
    send: () => { throw new Error('Player realtime is receive-only') },
    close: async () => { await client.deactivate() },
    onMessage: (cb) => { onMessage = cb },
    onClose: (cb) => { onClose = cb },
    onError: (cb) => { onError = cb },
  }
  return socket
}
