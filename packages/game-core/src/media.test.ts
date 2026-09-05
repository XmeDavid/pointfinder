import { describe, expect, it, vi } from 'vitest'
import { ApiError, type UploadSessionResponse } from '@pointfinder/api'
import { uploadSubmissionMedia, type MediaStore } from './media'
import { MemoryQueueStore, OfflineQueue, type PendingSubmission } from './queue'

function fixture() {
  const action: PendingSubmission = {
    id: 'submission', type: 'submission', gameId: 'g', baseId: 'b', challengeId: 'c', answer: '',
    state: 'pending', attempts: 0, nextAttemptAt: 0, createdAt: '',
    media: [{ id: 'media', name: 'photo.jpg', contentType: 'image/jpeg', size: 2500, uploadedBytes: 0 }],
  }
  let session: UploadSessionResponse = { sessionId: 'session', gameId: 'g', mediaItemKey: 'media', contentType: 'image/jpeg', totalSizeBytes: 2500, chunkSizeBytes: 1024, totalChunks: 3, uploadedChunks: [], status: 'active', expiresAt: '' }
  const store: MediaStore = { put: vi.fn(), remove: vi.fn(), read: vi.fn(async (_id, offset, length) => new Uint8Array(length).fill(offset / 1024)) }
  const api = {
    start: vi.fn(async () => ({ ...session })), get: vi.fn(async () => ({ ...session })),
    putChunk: vi.fn(async (_game, _session, index) => { session = { ...session, uploadedChunks: [...new Set([...session.uploadedChunks, index])] }; return session }),
    complete: vi.fn(async () => { session = { ...session, status: 'completed', fileUrl: '/files/photo.jpg' }; return session }),
    cancel: vi.fn(), cancelAll: vi.fn(), list: vi.fn(),
  }
  const checkpoint = vi.fn(async (_id, media) => { action.media = structuredClone(media) })
  const requireSession = vi.fn()
  return { action, store, api, checkpoint, requireSession, setSession: (next: Partial<UploadSessionResponse>) => { session = { ...session, ...next } } }
}

describe('durable media uploads', () => {
  it('checkpoints completion before submission and uses stable media keys', async () => {
    const f = fixture()
    expect(await uploadSubmissionMedia(f.action, f)).toEqual(['/files/photo.jpg'])
    expect(f.api.start).toHaveBeenCalledWith('g', expect.objectContaining({ mediaItemKey: 'media', totalSizeBytes: 2500 }))
    expect(f.store.read).toHaveBeenLastCalledWith('media', 2048, 452)
    expect(f.action.media?.[0]).toMatchObject({ sessionId: 'session', uploadedBytes: 2500, fileUrl: '/files/photo.jpg' })
  })

  it('resumes after a lost chunk response and restart without reuploading server chunks', async () => {
    const f = fixture()
    const original = f.api.putChunk.getMockImplementation()!
    f.api.putChunk.mockImplementationOnce(async (...args) => { await original(...args); throw ApiError.network('response lost') })
    await expect(uploadSubmissionMedia(f.action, f)).rejects.toMatchObject({ code: 'NETWORK' })
    expect(f.action.media?.[0]?.sessionId).toBe('session')
    const reopened = structuredClone(f.action)
    f.api.putChunk.mockClear()
    await uploadSubmissionMedia(reopened, f)
    expect(f.api.start).toHaveBeenCalledTimes(1)
    expect(f.api.putChunk.mock.calls.map((args) => args[2])).toEqual([1, 2])
  })

  it('recovers a lost start response by repeating the same media key', async () => {
    const f = fixture()
    f.api.start.mockRejectedValueOnce(ApiError.timeout())
    await expect(uploadSubmissionMedia(f.action, f)).rejects.toThrow()
    await uploadSubmissionMedia(f.action, f)
    expect(f.api.start.mock.calls[0]).toEqual(f.api.start.mock.calls[1])
  })

  it('recovers a lost completion response without reading local media again', async () => {
    const f = fixture()
    f.api.complete.mockImplementationOnce(async () => { f.setSession({ status: 'completed', fileUrl: '/files/photo.jpg' }); throw ApiError.timeout() })
    await expect(uploadSubmissionMedia(f.action, f)).rejects.toThrow()
    f.store.read = vi.fn(async () => { throw new Error('Source no longer available') })
    expect(await uploadSubmissionMedia(f.action, f)).toEqual(['/files/photo.jpg'])
    expect(f.store.read).not.toHaveBeenCalled()
  })

  it('creates a replacement for expired sessions using the same media key', async () => {
    const f = fixture()
    f.action.media![0]!.sessionId = 'expired'
    f.api.get.mockResolvedValueOnce({ ...(await f.api.start()), status: 'expired' })
    f.api.start.mockClear()
    await uploadSubmissionMedia(f.action, f)
    expect(f.api.start).toHaveBeenCalledWith('g', expect.objectContaining({ mediaItemKey: 'media' }))
  })

  it('does not upload saved bytes after the session changes during storage read', async () => {
    const f = fixture()
    f.store.read = vi.fn(async () => {
      f.requireSession.mockImplementation(() => { throw new ApiError({ status: 401, message: 'Session changed' }) })
      return new Uint8Array(1024)
    })
    await expect(uploadSubmissionMedia(f.action, f)).rejects.toMatchObject({ status: 401 })
    expect(f.api.putChunk).not.toHaveBeenCalled()
  })

  it('reports missing media instead of submitting an empty answer', async () => {
    const f = fixture()
    f.store.read = vi.fn(async () => new Uint8Array(1))
    await expect(uploadSubmissionMedia(f.action, f)).rejects.toMatchObject({ code: 'MEDIA_NEEDS_RESELECT' })
    expect(f.api.complete).not.toHaveBeenCalled()
  })

  it('rejects a session belonging to a different game before sending bytes', async () => {
    const f = fixture()
    f.setSession({ gameId: 'other-game' })
    await expect(uploadSubmissionMedia(f.action, f)).rejects.toMatchObject({ code: 'UPLOAD_METADATA_MISMATCH' })
    expect(f.store.read).not.toHaveBeenCalled()
  })

  it('preserves upload checkpoints on a queue failure and cleans bytes only after acknowledgment', async () => {
    const f = fixture()
    const store = new MemoryQueueStore()
    await store.upsert(f.action)
    const submit = vi.fn().mockRejectedValueOnce(ApiError.timeout()).mockResolvedValue({ id: 'server-submission' })
    const onRemoved = vi.fn(async () => {})
    let now = 1
    const queue = new OfflineQueue({ store, now: () => now, onRemoved, executor: {
      checkIn: vi.fn(),
      submit: async (action) => { await uploadSubmissionMedia(action, { ...f, checkpoint: (id, media) => queue.updateMedia(id, media) }); return submit() },
    } })
    await queue.sync()
    expect((await queue.list())[0]).toMatchObject({ state: 'pending', media: [{ fileUrl: '/files/photo.jpg' }] })
    expect(onRemoved).not.toHaveBeenCalled()
    now += 3000
    await queue.sync()
    expect(f.api.complete).toHaveBeenCalledTimes(1)
    expect(onRemoved).toHaveBeenCalledTimes(1)
    expect(await queue.list()).toEqual([])
  })
})
