import { describe, expect, it, vi } from 'vitest'
import { ApiError, type CheckInResponse } from '@pointfinder/api'
import type { CheckInProof } from './proof'
import { MemoryQueueStore, OfflineQueue, backoffMs, sortForSync, type PendingAction, type PendingCheckIn, type QueueExecutor } from './queue'

const nfc = (token = 't'): CheckInProof => ({ type: 'nfc', token })
const receipt = (baseId = 'b'): CheckInResponse => ({ checkInId: 'c', baseId, checkedInAt: 'x', method: 'NFC', verification: 'VERIFIED' })

function make(executor: Partial<QueueExecutor> = {}, nowMs = 1_000_000) {
  const store = new MemoryQueueStore()
  let now = nowMs
  const exec: QueueExecutor = {
    checkIn: executor.checkIn ?? vi.fn(async () => receipt()),
    submit: executor.submit ?? vi.fn(async () => ({}) as never),
  }
  const queue = new OfflineQueue({ store, executor: exec, now: () => now })
  return { queue, store, exec, tick: (ms: number) => (now += ms) }
}

describe('OfflineQueue', () => {
  it('holds a submission behind its failed check-in without sending it', async () => {
    const { queue, exec } = make({ checkIn: async () => { throw ApiError.fromResponse(400, { code: 'CHECK_IN_TOKEN_INVALID' }) } })
    await queue.enqueueCheckIn({ id: 'check-in', gameId: 'g', baseId: 'b', proof: nfc('proof') })
    await queue.enqueueSubmission({ id: 'submit', gameId: 'g', baseId: 'b', challengeId: 'c', answer: 'answer' })
    await queue.sync()
    expect(exec.submit).not.toHaveBeenCalled()
    expect(await queue.list()).toMatchObject([{ state: 'failed' }, { state: 'pending' }])
  })

  it('does not attribute an action to a new account if ownership changes during enqueue', async () => {
    let owner = 'alice'
    const store = new MemoryQueueStore()
    store.list = async () => { owner = 'bob'; return [] }
    const queue = new OfflineQueue({ store, owner: () => owner, executor: { checkIn: vi.fn(), submit: vi.fn() } })
    const write = vi.spyOn(store, 'upsert')
    await expect(queue.enqueueSubmission({ id: 'submit', gameId: 'g', baseId: 'b', challengeId: 'c', answer: 'Alice’s answer' })).rejects.toMatchObject({ status: 401 })
    expect(write).not.toHaveBeenCalled()
  })

  it('orders check-ins before submissions, oldest first', () => {
    const mk = (type: PendingAction['type'], createdAt: string, id: string) =>
      ({ type, id, gameId: 'g', baseId: 'b', createdAt, attempts: 0, nextAttemptAt: 0, state: 'pending', proof: nfc(), challengeId: 'c', answer: '' }) as PendingAction
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
    const a = await queue.enqueueCheckIn({ id: '1', gameId: 'g', baseId: 'b', proof: nfc() })
    const b = await queue.enqueueCheckIn({ id: '2', gameId: 'g', baseId: 'b', proof: nfc() })
    expect(b.id).toBe(a.id)
    expect(await queue.pendingCount()).toBe(1)
  })

  it('syncs due actions in order and removes them', async () => {
    const calls: string[] = []
    const { queue } = make({
      checkIn: vi.fn(async (a) => { calls.push(`ci:${a.baseId}`); return receipt(a.baseId) }),
      submit: vi.fn(async (a) => { calls.push(`sub:${a.baseId}:${a.id}`); return {} as never }),
    })
    await queue.enqueueSubmission({ id: 's1', gameId: 'g', baseId: 'b1', challengeId: 'ch', answer: '42' })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b1', proof: nfc() })
    const report = await queue.sync()
    expect(calls).toEqual(['ci:b1', 'sub:b1:s1'])
    expect(report.outcomes.map((o) => o.result)).toEqual(['synced', 'synced'])
    expect(await queue.pendingCount()).toBe(0)
  })

  it('keeps retryable failures with a backoff and skips them until due', async () => {
    const checkIn = vi.fn(async () => { throw ApiError.network(new Error('offline')) })
    const { queue, tick } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', proof: nfc() })
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
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', proof: nfc() })
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
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', proof: nfc() })
    await queue.enqueueSubmission({ id: 's1', gameId: 'g', baseId: 'b', challengeId: 'ch', answer: 'a' })
    const report = await queue.sync()
    expect(report.authRequired).toBe(true)
    expect(submit).not.toHaveBeenCalled()
    expect(await queue.pendingCount()).toBe(2)
  })

  it('shares one run between concurrent sync calls', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const checkIn = vi.fn(async () => { await gate; return receipt() })
    const { queue } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'c1', gameId: 'g', baseId: 'b', proof: nfc() })
    const p1 = queue.sync()
    const p2 = queue.sync()
    expect(p1).toBe(p2)
    release()
    await p1
    expect(checkIn).toHaveBeenCalledTimes(1)
  })
})

describe('typed proofs', () => {
  it('replays a queued geo proof with the fix that was captured at the base', async () => {
    const seen: CheckInProof[] = []
    const { queue } = make({ checkIn: vi.fn(async (a) => { seen.push(a.proof); return receipt(a.baseId) }) })
    const proof: CheckInProof = { type: 'geo', lat: 41.1, lng: -8.6, accuracy: 8.5, capturedAt: '2026-09-05T10:00:00Z', claimed: false }
    await queue.enqueueCheckIn({ id: 'g1', gameId: 'g', baseId: 'b', proof })
    await queue.sync()
    expect(seen).toEqual([proof])
    expect(await queue.list()).toEqual([])
  })

  it('replays a claim with its dwell buffer intact', async () => {
    const seen: CheckInProof[] = []
    const { queue } = make({ checkIn: vi.fn(async (a) => { seen.push(a.proof); return receipt(a.baseId) }) })
    const proof: CheckInProof = {
      type: 'geo', lat: 41.1, lng: -8.6, accuracy: 22, capturedAt: '2026-09-05T10:00:00Z', claimed: true,
      dwell: [{ lat: 41.1, lng: -8.6, accuracy: 30, capturedAt: '2026-09-05T09:58:50Z' }],
    }
    await queue.enqueueCheckIn({ id: 'g2', gameId: 'g', baseId: 'b', proof })
    await queue.sync()
    expect(seen).toEqual([proof])
  })

  it('reads a row written before proofs were typed as an nfc proof', async () => {
    const store = new MemoryQueueStore()
    await store.upsert({ type: 'check_in', id: 'legacy', gameId: 'g', baseId: 'b', nfcToken: 'ab12cd34', createdAt: '2026-09-05T09:00:00Z', attempts: 0, nextAttemptAt: 0, state: 'pending' } as unknown as PendingAction)
    const seen: CheckInProof[] = []
    const queue = new OfflineQueue({ store, executor: { checkIn: vi.fn(async (a) => { seen.push(a.proof); return receipt(a.baseId) }), submit: vi.fn() } })
    expect(await queue.list()).toMatchObject([{ id: 'legacy', proof: { type: 'nfc', token: 'ab12cd34' } }])
    await queue.sync()
    expect(seen).toEqual([{ type: 'nfc', token: 'ab12cd34' }])
    expect(await store.list()).toEqual([])
  })

  it('leaves a stored proof alone when both fields somehow exist', async () => {
    const store = new MemoryQueueStore()
    await store.upsert({ type: 'check_in', id: 'both', gameId: 'g', baseId: 'b', nfcToken: 'old', proof: nfc('new'), createdAt: '', attempts: 0, nextAttemptAt: 0, state: 'pending' } as unknown as PendingAction)
    const queue = new OfflineQueue({ store, executor: { checkIn: vi.fn(async () => receipt()), submit: vi.fn() } })
    expect((await queue.list())[0] as PendingCheckIn).toMatchObject({ proof: { type: 'nfc', token: 'new' } })
  })
})

describe('ordered offline check-ins', () => {
  it('holds later check-ins behind a network failure and syncs them in order after recovery', async () => {
    const checkIn = vi.fn().mockRejectedValueOnce(ApiError.network(null)).mockResolvedValue(receipt())
    const { queue, tick } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'q1', gameId: 'g', baseId: 'b1', proof: nfc() })
    await queue.enqueueCheckIn({ id: 'q2', gameId: 'g', baseId: 'b2', proof: nfc(), prerequisiteCheckInIds: ['q1'] })
    await queue.sync()
    expect(checkIn).toHaveBeenCalledTimes(1)
    tick(2001)
    await queue.sync()
    expect(checkIn.mock.calls.map(([a]) => a.baseId)).toEqual(['b1', 'b1', 'b2'])
    expect(await queue.list()).toEqual([])
  })

  it('permanently rejects dependent proofs after an earlier tag fails, requiring a fresh scan', async () => {
    const checkIn = vi.fn().mockRejectedValue(ApiError.fromResponse(403, { code: 'CHECK_IN_TOKEN_INVALID' }))
    const { queue } = make({ checkIn })
    await queue.enqueueCheckIn({ id: 'q1', gameId: 'g', baseId: 'b1', proof: nfc() })
    await queue.enqueueCheckIn({ id: 'q2', gameId: 'g', baseId: 'b2', proof: nfc(), prerequisiteCheckInIds: ['q1'] })
    await queue.sync()
    expect(checkIn).toHaveBeenCalledTimes(1)
    expect((await queue.list())[1]).toMatchObject({ state: 'failed', lastErrorCode: 'PREVIOUS_CHECK_IN_FAILED' })
    await queue.retry('q2')
    await queue.discard('q1')
    await queue.sync()
    expect(checkIn).toHaveBeenCalledTimes(1)
  })

  it('does not treat a discarded prerequisite as a successful check-in', async () => {
    const { queue, exec } = make()
    await queue.enqueueCheckIn({ id: 'q1', gameId: 'g', baseId: 'b1', proof: nfc() })
    await queue.enqueueCheckIn({ id: 'q2', gameId: 'g', baseId: 'b2', proof: nfc(), prerequisiteCheckInIds: ['q1'] })
    await queue.discard('q1')
    await queue.sync()
    expect(exec.checkIn).not.toHaveBeenCalled()
    expect((await queue.list())[0]).toMatchObject({ state: 'failed', lastErrorCode: 'PREVIOUS_CHECK_IN_FAILED' })
  })

  it('preserves the missing base number and does not retry refused out-of-order proofs', async () => {
    const { queue } = make({ checkIn: async () => { throw ApiError.fromResponse(400, { code: 'PREVIOUS_BASE_REQUIRED', errors: { nextRequiredBaseNumber: '2' } }) } })
    await queue.enqueueCheckIn({ id: 'q3', gameId: 'g', baseId: 'b3', proof: nfc() })
    expect((await queue.sync()).outcomes[0]).toMatchObject({ result: 'failed', details: { nextRequiredBaseNumber: '2' } })
    await queue.retry('q3')
    expect((await queue.list())[0]).toMatchObject({ state: 'failed', lastErrorDetails: { nextRequiredBaseNumber: '2' } })
  })
})

it('a fresh scan replaces the refused proof so it cannot block later submissions', async () => {
  const checkIn = vi.fn().mockRejectedValueOnce(ApiError.fromResponse(400, { code: 'PREVIOUS_BASE_REQUIRED', errors: { nextRequiredBaseNumber: '1' } })).mockResolvedValue(receipt('b2'))
  const { queue, exec } = make({ checkIn })
  await queue.enqueueCheckIn({ id: 'old', gameId: 'g', baseId: 'b2', proof: nfc('old') })
  await queue.sync()
  await queue.enqueueCheckIn({ id: 'fresh', gameId: 'g', baseId: 'b2', proof: nfc('new') })
  await queue.enqueueSubmission({ id: 'answer', gameId: 'g', baseId: 'b2', challengeId: 'c2', answer: 'yes' })
  await queue.sync()
  expect(exec.submit).toHaveBeenCalledTimes(1)
  expect(await queue.list()).toEqual([])
})
