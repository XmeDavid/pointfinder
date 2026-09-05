import { describe, expect, it, vi } from 'vitest'
import { MemoryQueueStore, OfflineQueue, type MediaStore } from '@pointfinder/game-core'
import type { AuthState } from '@pointfinder/api'
import { createMediaService } from './media'

const player: AuthState = { kind: 'player', token: 'token', playerId: 'player', teamId: 'team', gameId: 'game', displayName: '', teamName: '', teamColor: '', gameName: '', gameStatus: 'live' }
const submission = { id: 'submission', gameId: 'game', baseId: 'base', challengeId: 'challenge', answer: '', files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] }
function fixture() {
  let auth = player
  const media: MediaStore = { put: vi.fn(async () => {}), read: vi.fn(), remove: vi.fn(async () => {}) }
  const queue = new OfflineQueue({ store: new MemoryQueueStore(), executor: { checkIn: vi.fn(), submit: vi.fn() } })
  return { media, queue, service: createMediaService(media, queue, () => auth), logout: () => { auth = { kind: 'none' } } }
}
describe('media submission intake', () => {
  it('only acknowledges queued work after all local files are durable', async () => {
    const f = fixture()
    let finish!: () => void
    f.media.put = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    const pending = f.service.enqueueSubmission(submission)
    await vi.waitFor(() => expect(f.media.put).toHaveBeenCalled())
    expect(await f.queue.list()).toEqual([])
    finish()
    expect(await pending).toMatchObject({ id: 'submission', media: [{ name: 'photo.jpg', size: 5 }] })
    expect(await f.queue.list()).toHaveLength(1)
  })
  it('removes partial local copies on storage failure and leaves no false queued action', async () => {
    const f = fixture()
    f.media.put = vi.fn().mockRejectedValue(new DOMException('Storage is full', 'QuotaExceededError'))
    await expect(f.service.enqueueSubmission(submission)).rejects.toThrow('Storage is full')
    expect(await f.queue.list()).toEqual([])
    expect(f.media.remove).toHaveBeenCalledTimes(1)
  })
  it('does not attach files to a different session when logout happens during local copy', async () => {
    const f = fixture()
    f.media.put = vi.fn(async () => { f.logout() })
    await expect(f.service.enqueueSubmission(submission)).rejects.toMatchObject({ status: 401 })
    expect(await f.queue.list()).toEqual([])
    expect(f.media.remove).toHaveBeenCalledTimes(1)
  })
  it('deduplicates double taps while copying and preserves the original action', async () => {
    const f = fixture()
    const [one, two] = await Promise.all([f.service.enqueueSubmission(submission), f.service.enqueueSubmission(submission)])
    expect(one.id).toBe(two.id)
    expect(f.media.put).toHaveBeenCalledTimes(1)
    await f.service.enqueueSubmission(submission)
    expect(f.media.put).toHaveBeenCalledTimes(1)
  })
})
