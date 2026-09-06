import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { MUTATION_KEYS, subscribeMutationLog } from './mutationLog'

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } })
}

async function run(qc: QueryClient, options: { mutationKey?: unknown[]; fail?: boolean }) {
  const mutation = qc.getMutationCache().build(qc, {
    mutationKey: options.mutationKey as never,
    mutationFn: async () => {
      if (options.fail) throw new Error('boom')
      return 'ok'
    },
  })
  await mutation.execute(undefined).catch(() => undefined)
}

describe('subscribeMutationLog', () => {
  it('exposes the nine log keys the scenarios use', () => {
    expect(MUTATION_KEYS).toEqual({
      baseCreate: 'base:create',
      baseUpdate: 'base:update',
      challengeCreate: 'challenge:create',
      challengeUpdate: 'challenge:update',
      assignmentsSet: 'assignments:set',
      assignmentsCreate: 'assignments:create',
      gameUpdate: 'game:update',
      gameStatus: 'game:status',
      gameCreate: 'game:create',
    })
  })

  it('records a colon-joined key with a timestamp on success', async () => {
    const qc = client()
    const record = vi.fn()
    const unsubscribe = subscribeMutationLog(qc, record)

    await run(qc, { mutationKey: ['base', 'update'] })

    expect(record).toHaveBeenCalledWith('base:update', expect.any(Number))
    expect(record.mock.calls[0][1]).toBeGreaterThan(0)
    unsubscribe()
  })

  it('ignores failures and mutations without a two-string key', async () => {
    const qc = client()
    const record = vi.fn()
    const unsubscribe = subscribeMutationLog(qc, record)

    await run(qc, { mutationKey: ['base', 'update'], fail: true })
    await run(qc, { mutationKey: undefined })
    await run(qc, { mutationKey: ['bases'] })
    await run(qc, { mutationKey: ['bases', 'game-1', 'update'] })
    await run(qc, { mutationKey: ['bases', 7] })

    expect(record).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('stops recording after unsubscribe', async () => {
    const qc = client()
    const record = vi.fn()
    subscribeMutationLog(qc, record)()

    await run(qc, { mutationKey: ['game', 'status'] })

    expect(record).not.toHaveBeenCalled()
  })
})
