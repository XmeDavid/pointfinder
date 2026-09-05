import type { Client } from '@stomp/stompjs'
import { isNative } from './runtime'
import { brokerUrl } from './config'

export async function prepareStompTransport(client: Client, headers: Record<string, string> = {}): Promise<void> {
  if (!isNative()) return
  const { createStompSocket } = await import('./tauri/stompSocket')
  client.webSocketFactory = () => createStompSocket(brokerUrl(), headers)
}
