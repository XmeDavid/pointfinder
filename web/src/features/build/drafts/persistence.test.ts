import { beforeEach, describe, expect, it, vi } from 'vitest'

const disk = vi.hoisted(() => new Map<string, string>())
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }))
vi.mock('@/platform', () => ({ kv: storage }))
import { flushDraftWrites, useDraftStore } from './draftStore'
import { loadPendingCreation, resetPendingCreations, savePendingCreation } from './pendingCreation'

beforeEach(async () => {
  await flushDraftWrites()
  disk.clear()
  vi.resetAllMocks()
  useDraftStore.getState().resetAll()
  resetPendingCreations()
  storage.get.mockImplementation(async key => disk.get(key) ?? null)
  storage.set.mockImplementation(async (key, value) => { disk.set(key, value) })
  storage.remove.mockImplementation(async key => { disk.delete(key) })
})

describe('durable recovery storage', () => {
  it('serializes edits and discard behind an in-flight write', async () => {
    let finish!: () => void
    storage.set.mockImplementationOnce((key, value) => new Promise<void>(resolve => {
      finish = () => { disk.set(key, value); resolve() }
    }))
    useDraftStore.getState().write('key', { name: 'First' }, { name: 'Original' })
    await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1))
    useDraftStore.getState().write('key', { name: 'Last' }, { name: 'Original' })
    useDraftStore.getState().clear('key')
    expect(storage.remove).not.toHaveBeenCalled()
    finish()
    await flushDraftWrites()
    expect(disk.has('pf.key')).toBe(false)
  })

  it('retains edits and surfaces a storage failure', async () => {
    storage.set.mockRejectedValueOnce(new Error('Disk full'))
    useDraftStore.getState().write('key', { name: 'Recover me' }, { name: 'Original' })
    await flushDraftWrites()
    expect(useDraftStore.getState().records.key?.fields).toEqual({ name: 'Recover me' })
    expect(useDraftStore.getState().status.key.state).toBe('storage-error')
  })

  it('refuses to start creation when its operation cannot be persisted', async () => {
    storage.set.mockRejectedValueOnce(new Error('Disk full'))
    await expect(savePendingCreation('create-key', { idempotencyKey: 'operation', challengeId: null, startedAt: 1 })).rejects.toThrow('Disk full')
    expect(await loadPendingCreation('create-key')).toBeNull()
  })

  it('does not treat an unreadable operation store as a fresh creation', async () => {
    storage.get.mockRejectedValueOnce(new Error('Unavailable'))
    await expect(loadPendingCreation('create-key')).rejects.toThrow('Unavailable')
  })

  it('restores the same operation after memory is lost', async () => {
    const operation = { idempotencyKey: 'stable-operation', challengeId: 'challenge', startedAt: 1 }
    await savePendingCreation('create-key', operation)
    resetPendingCreations()
    expect(await loadPendingCreation('create-key')).toEqual(operation)
  })
})
