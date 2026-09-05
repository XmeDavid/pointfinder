import { expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ subscriptions: [] as string[], config: {} as Record<string, unknown> }))
vi.mock('@stomp/stompjs', () => ({ Client: class {
  onConnect?: () => void
  constructor(config: Record<string, unknown>) { state.config = config }
  activate() { queueMicrotask(() => this.onConnect?.()) }
  subscribe(topic: string) { state.subscriptions.push(topic) }
  async deactivate() {}
} }))
import { browserSocketFactory } from './socketFactory'
it('authenticates in STOMP CONNECT and only subscribes to player-safe topics', async () => {
  state.subscriptions = []
  const token = `header.${btoa(JSON.stringify({ teamId: 'own-team' }))}.signature`
  const socket = await browserSocketFactory('https://example.test/ws/mobile?gameId=game', { Authorization: `Bearer ${token}` })
  expect(state.config.connectHeaders).toEqual({ Authorization: `Bearer ${token}` })
  expect(String(state.config.brokerURL)).not.toContain(token)
  expect(state.subscriptions).toEqual(['/topic/games/game', '/topic/games/game/team/own-team/submission_status'])
  await socket.close()
})
