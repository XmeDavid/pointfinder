import { expect, it } from 'vitest'
import { MemoryQueueStore, type PendingAction } from '@pointfinder/game-core'
import type { StoredAuth } from '@pointfinder/api'
import { createServices } from './client'
import type { CachedSnapshot, PlatformServices } from '@/platform/contracts'

it('migrates the existing player’s unowned native queue and cached snapshots before new sessions can join', async () => {
  const queue = new MemoryQueueStore()
  await queue.upsert({ id: 'old-action', type: 'check_in', gameId: 'g', baseId: 'b', nfcToken: 'proof', createdAt: '', attempts: 0, nextAttemptAt: 0, state: 'pending' } as unknown as PendingAction)
  const cache = new Map<string, CachedSnapshot<unknown>>([['snapshot:g', { stateVersion: 5, fetchedAt: '', snapshot: { team: 'own-team' } }]])
  const auth: StoredAuth = { kind: 'player', token: 'token', playerId: 'p', teamId: 't', gameId: 'g', displayName: 'Scout', teamName: 'Team', teamColor: '', gameName: 'Game', gameStatus: 'live' }
  const platform: PlatformServices = {
    media: { put: async () => {}, read: async () => new Uint8Array(), remove: async () => {} },
    queue, fetch: globalThis.fetch,
    tokens: { load: async () => auth, save: async () => {}, clear: async () => {} },
    cache: {
      load: async <T,>(key: string) => cache.get(key) as CachedSnapshot<T> ?? null,
      save: async (key, stateVersion, snapshot) => { cache.set(key, { stateVersion, snapshot, fetchedAt: '' }) },
      clear: async (key) => { if (key) cache.delete(key) },
    },
    settings: { get: async () => null, set: async () => {}, remove: async () => {} },
    socketFactory: async () => { throw new Error('No network during restoration') },
  }
  const services = await createServices(platform)
  expect(await services.queue.list()).toMatchObject([{ id: 'old-action', playerId: 'p', proof: { type: 'nfc', token: 'proof' } }])
  expect(cache.get('snapshot:p:g')).toMatchObject({ stateVersion: 5, snapshot: { team: 'own-team' } })
  expect(cache.has('snapshot:g')).toBe(false)
})

it('replays a queued choice answer with the options the team chose', async () => {
  const auth: StoredAuth = { kind: 'player', token: 'token', playerId: 'p', teamId: 't', gameId: 'g', displayName: 'Scout', teamName: 'Team', teamColor: '', gameName: 'Game', gameStatus: 'live' }
  const bodies: unknown[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/submissions')) bodies.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ id: 's', status: 'correct' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const platform: PlatformServices = {
    media: { put: async () => {}, read: async () => new Uint8Array(), remove: async () => {} },
    queue: new MemoryQueueStore(), fetch,
    tokens: { load: async () => auth, save: async () => {}, clear: async () => {} },
    cache: { load: async () => null, save: async () => {}, clear: async () => {} },
    settings: { get: async () => null, set: async () => {}, remove: async () => {} },
    socketFactory: async () => { throw new Error('offline') },
  }
  const services = await createServices(platform)
  await services.queue.enqueueSubmission({ id: 'answer-1', gameId: 'g', baseId: 'b', challengeId: 'c', answer: '', selectedOptionIds: ['opt-2', 'opt-3'] })
  await services.queue.sync()
  expect(bodies).toEqual([expect.objectContaining({ challengeId: 'c', selectedOptionIds: ['opt-2', 'opt-3'], idempotencyKey: 'answer-1' })])
})
