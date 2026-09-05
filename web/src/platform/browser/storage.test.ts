import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { BrowserQueueStore, browserGameCache } from './storage'
import { BrowserTokenStore } from './tokenStore'
import { OfflineQueue, type PendingAction } from '@pointfinder/game-core'
import { playerQueueStore } from '@/app/player/client'

const action: PendingAction = { id: 'durable-action', type: 'submission', gameId: 'g', baseId: 'b', challengeId: 'c', answer: '42', createdAt: '2026-09-05', attempts: 0, nextAttemptAt: 0, state: 'pending' }
describe('browser offline storage', () => {
  it('retains queued actions across store instances and isolates players', async () => {
    const first = playerQueueStore(new BrowserQueueStore(), () => 'alice')
    await first.upsert(action)
    const reopened = playerQueueStore(new BrowserQueueStore(), () => 'alice')
    expect(await reopened.list()).toEqual([{ ...action, playerId: 'alice' }])
    expect(await playerQueueStore(new BrowserQueueStore(), () => 'bob').list()).toEqual([])
    const unauthenticated = playerQueueStore(new BrowserQueueStore(), () => null)
    expect(await unauthenticated.list()).toEqual([])
    await expect(unauthenticated.upsert(action)).rejects.toThrow('player session')
    await reopened.remove(action.id)
  })
  it('does not replay another player’s actions when sharing the same device', async () => {
    const store = new BrowserQueueStore()
    await playerQueueStore(store, () => 'alice').upsert({ ...action, id: 'alice-action' })
    const queue = new OfflineQueue({ store: playerQueueStore(store, () => 'bob'), executor: {
      checkIn: () => { throw new Error('must not execute') }, submit: () => { throw new Error('must not execute') },
    } })
    expect((await queue.sync()).outcomes).toEqual([])
    expect(await playerQueueStore(store, () => 'alice').list()).toHaveLength(1)
    await store.remove('alice-action')
  })
  it('persists snapshots separately by player and game', async () => {
    await browserGameCache.save('snapshot:alice:g', 7, { secret: 'own-team' })
    expect(await browserGameCache.load('snapshot:alice:g')).toMatchObject({ stateVersion: 7, snapshot: { secret: 'own-team' } })
    expect(await browserGameCache.load('snapshot:bob:g')).toBeNull()
    await browserGameCache.clear('snapshot:alice:g')
    expect(await browserGameCache.load('snapshot:alice:g')).toBeNull()
  })
  it('rejects storing browser operator refresh credentials', async () => {
    const store = new BrowserTokenStore()
    await expect(store.save({ kind: 'operator', accessToken: 'access', refreshToken: 'refresh', userId: 'u', userName: 'U', email: 'u@test', role: 'operator' })).rejects.toThrow('HttpOnly')
    expect(localStorage.getItem('pf.auth')).toBeNull()
  })
})
