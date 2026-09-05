import { expect, it } from 'vitest'
import { createClient } from './client'
import { MemoryTokenStore, type StoredAuth } from './auth'

it('an old player request cannot log out a newer player when its 401 arrives late', async () => {
  let respond!: (response: Response) => void
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  const store = new MemoryTokenStore()
  const old: StoredAuth = { kind: 'player', token: 'old', playerId: 'old', teamId: 't', gameId: 'g', displayName: '', teamName: '', teamColor: '', gameName: '', gameStatus: 'live' }
  await store.save(old)
  const client = createClient({ baseUrl: 'https://test.invalid', tokenStore: store, socketFactory: async () => { throw new Error('unused') }, fetch: async () => {
    started()
    return new Promise<Response>((resolve) => { respond = resolve })
  } })
  const pending = client.api.player.notifications().catch((error) => error)
  await ready
  await client.session.setPlayer({ token: 'new', player: { id: 'new', displayName: '', deviceId: 'device' }, team: { id: 't', name: '', color: '' }, game: { id: 'g', name: '', description: '', status: 'live' } })
  respond(new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }))
  expect(await pending).toMatchObject({ status: 401 })
  expect(client.session.current).toMatchObject({ kind: 'player', playerId: 'new', token: 'new' })
  expect(await store.load()).toMatchObject({ playerId: 'new' })
})
