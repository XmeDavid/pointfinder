import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@pointfinder/api'
import { MemoryQueueStore, OfflineQueue, backoffMs, sortForSync, type PendingAction, type QueueExecutor } from './queue'

function make(executor: Partial<QueueExecutor> = {}, nowMs = 1_000_000) {
  const store = new MemoryQueueStore()
  let now = nowMs
  const exec: QueueExecutor = {
    checkIn: executor.checkIn ?? vi.fn(async () => ({ checkInId: 'c', baseId: 'b', checkedInAt: 'x' })),
    submit: executor.submit ?? vi.fn(async () => ({}) as never),
  }
  const queue = new OfflineQueue({ store, executor: exec, now: () => now })
  return { queue, store, exec, tick: (ms: number) => (now += ms) }
}

describe('OfflineQueue', () => {
  it('orders check-ins before submissions, oldest first', () => {
    const mk = (type: PendingAction['type'], createdAt: string, id: string) =>
      ({ type, id, gameId: 'g', baseId: 'b', createdAt, attempts: 0, nextAttemptAt: 0, state: 'pending', nfcToken: 't', challengeId: 'c', answer: '' }) as PendingAction
    const sorted = sortForSync([mk('submission', '2026-01-01T00:00:01Z', 's1'), mk('check_in', '2026-01-01T00:00:02Z', 'c2'), mk('check_in', '2026-01-01T00:00:00Z', 'c1')])
    expect(sorted.map((a) => a.id)).toEqual(['c1', 'c2', 's1'])
  })

  it('backs off exponentially from two seconds', () => {
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(3)).toBe(8000)
    expect(backoffMs(20)).toBe(60_000)
  })

  it('does not enqueue the same check-in twice', async () => {
    const { queue } = make()
    const a = await queue.enqueueCheckIn({ id: '1', gameId: 'g', baseId: 'b', nfcToken: 't' })
    const b = await queue.enqueueCheckIn({ id: '2', gameId: 'g', baseId: 'b', nfcToken: 't' })
    expect(b.id).toBe(a.id)
    expect(await queue.pendingCount()).toBe(1)
  })

  it('syncs due actions in order and removes them', async () => {
    const calls: string[] = []
    const { queue } = make({
      checkIn: vi.fn(async (a) => { calls.push(`ci:${a.baseId}`); return { checkInId: 'c', baseId: a.baseId, checkedInAt: 'x' } }),
      submit: vi.fn(async (a) => { calls.push(`sub:${a.baseId}:${a.id}`); return {} as never }),
    })
    await queue.enqueueSubmission({ id: 's1', gameId: 'g', baseId: 'b1', challengeId: 'ch', answer: '42' })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b1', nfcToken: 't' })
    const report = await queue.sync()
    expect(calls).toEqual(['ci:b1', 'sub:b1:s1'])
    expect(report.outcomes.map((o) => o.result)).toEqual(['synced', 'synced'])
    expect(await queue.pendingCount()).toBe(0)
  })

  it('keeps retryable failures with a backoff and skips them until due', async () => {
    const checkIn = vi.fn(async () => { throw ApiError.network(new Error('offline')) })
    const { queue, tick } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', nfcToken: 't' })
    const r1 = await queue.sync()
    expect(r1.outcomes[0]).toMatchObject({ result: 'retry_later', inMs: 2000 })
    const r2 = await queue.sync()
    expect(r2.outcomes).toEqual([])
    expect(checkIn).toHaveBeenCalledTimes(1)
    tick(2001)
    const r3 = await queue.sync()
    expect(r3.outcomes[0]).toMatchObject({ result: 'retry_later', inMs: 4000 })
    expect(await queue.pendingCount()).toBe(1)
  })

  it('marks server refusals as failed but never drops them', async () => {
    const { queue, store } = make({
      submit: vi.fn(async () => { throw ApiError.fromResponse(400, { message: 'No challenge assigned', code: 'X' }) }),
    })
    await queue.enqueueSubmission({ id: 's1', gameId: 'g', baseId: 'b', challengeId: 'ch', answer: 'a' })
    const report = await queue.sync()
    expect(report.outcomes[0]).toMatchObject({ result: 'failed', code: 'X' })
    const stored = (await store.list())[0]!
    expect(stored.state).toBe('failed')
    expect(stored.lastError).toBe('No challenge assigned')
    expect(await queue.failedCount()).toBe(1)
    await queue.retry('s1')
    expect((await store.list())[0]!.state).toBe('pending')
  })

  it('treats "already done" refusals as synced', async () => {
    const { queue } = make({
      checkIn: vi.fn(async () => { throw ApiError.fromResponse(409, { message: 'dup', code: 'MANUAL_CHECKIN_ALREADY_CHECKED_IN' }) }),
    })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', nfcToken: 't' })
    const report = await queue.sync()
    expect(report.outcomes[0]).toMatchObject({ result: 'synced' })
    expect(await queue.pendingCount()).toBe(0)
  })

  it('stops the run on a 401 and leaves everything pending', async () => {
    const submit = vi.fn()
    const { queue } = make({
      checkIn: vi.fn(async () => { throw ApiError.fromResponse(401, { message: 'expired' }) }),
      submit,
    })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', nfcToken: 't' })
    await queue.enqueueSubmission({ id: 's1', gameId: 'g', baseId: 'b', challengeId: 'ch', answer: 'a' })
    const report = await queue.sync()
    expect(report.authRequired).toBe(true)
    expect(submit).not.toHaveBeenCalled()
    expect(await queue.pendingCount()).toBe(2)
  })

  it('shares one run between concurrent sync calls', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const checkIn = vi.fn(async () => { await gate; return { checkInId: 'c', baseId: 'b', checkedInAt: 'x' } })
    const { queue } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', nfcToken: 't' })
    const p1 = queue.sync()
    const p2 = queue.sync()
    expect(p1).toBe(p2)
    release()
    await p1
    expect(checkIn).toHaveBeenCalledTimes(1)
  })
})
