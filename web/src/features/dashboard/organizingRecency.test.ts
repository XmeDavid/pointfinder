import { beforeEach, describe, expect, it, vi } from 'vitest'
const storage = vi.hoisted(() => ({ values: new Map<string, string>(), get: vi.fn(), set: vi.fn() }))
vi.mock('@/platform', () => ({ kv: storage }))
import { findRecentOrganizedGame, recentOrganizedGames, recordOrganizedGame } from './organizingRecency'

beforeEach(() => {
  storage.values.clear()
  storage.get.mockReset().mockImplementation(async (key: string) => storage.values.get(key) ?? null)
  storage.set.mockReset().mockImplementation(async (key: string, value: string) => { storage.values.set(key, value) })
})

describe('organizing history', () => {
  it('keeps account and workspace histories separate, with opened order and no duplicate IDs', async () => {
    await recordOrganizedGame('a', 'old', null)
    await recordOrganizedGame('a', 'new', null)
    await recordOrganizedGame('a', 'old', null)
    await recordOrganizedGame('a', 'club-game', 'club')
    await recordOrganizedGame('b', 'private-game', null)
    expect(await recentOrganizedGames('a', null)).toEqual(['old', 'new'])
    expect(await recentOrganizedGames('a', 'club')).toEqual(['club-game'])
    expect(await recentOrganizedGames('b', null)).toEqual(['private-game'])
    expect(await recentOrganizedGames('c', null)).toEqual([])
  })

  it('serializes concurrent entries and bounds retained history', async () => {
    await Promise.all(Array.from({ length: 14 }, (_, i) => recordOrganizedGame('a', `g${i}`, null)))
    expect(await recentOrganizedGames('a', null)).toEqual(Array.from({ length: 10 }, (_, i) => `g${13 - i}`))
  })

  it('waits for the workspace write before Home loads its history', async () => {
    let release!: () => void
    storage.set.mockImplementationOnce(async (key: string, value: string) => {
      await new Promise<void>(resolve => { release = resolve })
      storage.values.set(key, value)
    })
    const write = recordOrganizedGame('a', 'g', null)
    await vi.waitFor(() => expect(release).toBeDefined())
    const read = recentOrganizedGames('a', null)
    release()
    await write
    expect(await read).toEqual(['g'])
  })

  it('tolerates malformed records but exposes storage failure for retry', async () => {
    storage.get.mockResolvedValueOnce('{broken')
    expect(await recentOrganizedGames('a', null)).toEqual([])
    storage.get.mockRejectedValueOnce(new Error('unavailable'))
    await expect(recentOrganizedGames('a', null)).rejects.toThrow('unavailable')
  })
})

describe('authorized continuation lookup', () => {
  const game = { id: 'g', name: 'Current name from server', status: 'setup' as const, orgId: null }
  it('skips deleted, revoked and differently scoped games before selecting an accessible entry', async () => {
    const get = vi.fn()
      .mockRejectedValueOnce({ status: 404 })
      .mockRejectedValueOnce({ response: { status: 403 } })
      .mockResolvedValueOnce({ ...game, id: 'other-scope', orgId: 'club' })
      .mockResolvedValueOnce(game)
    expect(await findRecentOrganizedGame(['deleted', 'revoked', 'other-scope', 'g'], null, get)).toEqual(game)
    expect(get.mock.calls.map(args => args[0])).toEqual(['deleted', 'revoked', 'other-scope', 'g'])
  })
  it('does not mistake a connection failure for no recent game', async () => {
    const get = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(findRecentOrganizedGame(['g', 'older'], null, get)).rejects.toThrow('offline')
    expect(get).toHaveBeenCalledTimes(1)
  })
  it('returns discovery fallback when no history remains accessible', async () => {
    expect(await findRecentOrganizedGame(['gone'], null, vi.fn().mockRejectedValue({ status: 404 }))).toBeNull()
  })
})
