import { createClient, type PointFinderClient } from '@pointfinder/api'
import { OfflineQueue, uploadSubmissionMedia, type QueueStore, type PendingAction } from '@pointfinder/game-core'
import { createPlatformServices } from '@/platform'
import { apiOrigin } from '@/platform/config'
import type { PlatformServices } from '@/platform/contracts'
import { createMediaService, type PlayerMediaService } from './media'

export interface AppServices { client: PointFinderClient; queue: OfflineQueue; media: PlayerMediaService }
type OwnedAction = PendingAction & { playerId?: string }

/** Each session sees and replays only its own durable actions. */
export function playerQueueStore(store: QueueStore, playerId: () => string | null): QueueStore {
  return {
    async list() {
      const owner = playerId()
      return owner ? (await store.list() as OwnedAction[]).filter((a) => a.playerId === owner) : []
    },
    async upsert(action) {
      const owner = playerId()
      const owned = action as OwnedAction
      // An in-flight request can reject after logout. Preserve its original
      // owner while recording the result; never reassign old work to a new user.
      if (!owned.playerId && !owner) throw new Error('A player session is required to queue actions')
      await store.upsert({ ...action, playerId: owned.playerId ?? owner } as OwnedAction)
    },
    remove: (id) => store.remove(id),
  }
}
export async function createServices(platform?: PlatformServices): Promise<AppServices> {
  const p = platform ?? await createPlatformServices()
  const client = createClient({ baseUrl: apiOrigin(), fetch: p.fetch, tokenStore: p.tokens, socketFactory: p.socketFactory })
  await client.session.restore()
  if (p.media.prune) {
    const allActions = await p.queue.list()
    const retained = allActions.flatMap((action) => action.type === 'submission' ? (action.media ?? []).map((item) => item.id) : [])
    await p.media.prune(retained).catch(() => {})
  }
  const playerId = () => client.session.current.kind === 'player' ? client.session.current.playerId : null
  // Legacy queues had no owner. Attribute them only during restoration of the
  // existing player, before any new account can join on this installation.
  if (playerId()) {
    for (const action of await p.queue.list() as OwnedAction[]) {
      if (!action.playerId && action.gameId === (client.session.current.kind === 'player' ? client.session.current.gameId : null)) {
        await p.queue.upsert({ ...action, playerId: playerId()! } as OwnedAction)
      }
    }
  }
  const restored = client.session.current
  if (restored.kind === 'player') {
    for (const kind of ['data', 'snapshot']) {
      const oldKey = `${kind}:${restored.gameId}`
      const key = `${kind}:${restored.playerId}:${restored.gameId}`
      const legacy = await p.cache.load(oldKey)
      if (legacy) {
        if (!await p.cache.load(key)) await p.cache.save(key, legacy.stateVersion, legacy.snapshot)
        await p.cache.clear(oldKey)
      }
    }
  }
  function requireOwner(action: PendingAction) {
    if (!playerId() || (action as OwnedAction).playerId !== playerId()) throw Object.assign(new Error('Player session changed'), { status: 401 })
  }
  const queue = new OfflineQueue({
    owner: playerId,
    store: playerQueueStore(p.queue, playerId),
    executor: {
      checkIn: (a) => { requireOwner(a); return client.api.player.checkIn(a.gameId, a.baseId, a.nfcToken) },
      submit: async (a) => {
        requireOwner(a)
        const original = client.session.current
        const requireSession = () => {
          requireOwner(a)
          if (client.session.current.kind !== 'player' || original.kind !== 'player' || client.session.current.token !== original.token) throw Object.assign(new Error('Player session changed'), { status: 401 })
        }
        const fileUrls = await uploadSubmissionMedia(a, { store: p.media, api: client.api.player.uploads, requireSession, checkpoint: async (id, media) => {
          await queue.updateMedia(id, media)
          a.media = media
        } })
        requireSession()
        return client.api.player.submit(a.gameId, { baseId: a.baseId, challengeId: a.challengeId, answer: a.answer, fileUrls: fileUrls.length ? fileUrls : undefined, idempotencyKey: a.id })
      },
    },
    onRemoved: async (action) => {
      if (action.type === 'submission') await Promise.allSettled((action.media ?? []).map((item) => p.media.remove(item.id)))
    },
  })
  return { client, queue, media: createMediaService(p.media, queue, () => client.session.current) }
}
let services: Promise<AppServices> | undefined
export function getServices(): Promise<AppServices> {
  services ??= createServices().catch((error) => { services = undefined; throw error })
  return services
}
