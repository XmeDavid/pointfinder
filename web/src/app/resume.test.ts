import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const memory = vi.hoisted(() => new Map<string, string>())
vi.mock('@/platform', () => ({
  isNative: () => false,
  kv: {
    get: async (key: string) => memory.get(key) ?? null,
    set: async (key: string, value: string) => {
      memory.set(key, value)
    },
    remove: async (key: string) => {
      memory.delete(key)
    },
  },
}))

import {
  __flushResumeWriteForTests,
  __setPreloadedForTests,
  __setResumeEnabledForTests,
  clearResumeLocation,
  consumeResumeTarget,
  isResumablePath,
  preloadResumeTarget,
  recordResumeLocation,
  resumeTarget,
} from './resume'

const operator = { userId: 'u-op', playerId: null, accountId: null }
const player = { userId: null, playerId: 'p-1', accountId: null }
const nobody = { userId: null, playerId: null, accountId: null }

describe('resume (OW-38)', () => {
  beforeEach(() => {
    memory.clear()
    __setResumeEnabledForTests(true)
  })
  afterEach(() => {
    __setResumeEnabledForTests(null)
  })

  it('only considers screens behind a session', () => {
    expect(isResumablePath('/game/g1')).toBe(true)
    expect(isResumablePath('/game/g1/nfc')).toBe(true)
    expect(isResumablePath('/map')).toBe(true)
    expect(isResumablePath('/base/b1?token=x')).toBe(true)
    expect(isResumablePath('/dashboard?view=organize')).toBe(true)
    for (const path of ['/', '/login', '/register/abc', '/forgot-password', '/reset-password/t', '/welcome', '/tag/b1', '/billing/success', '/join/account', '/join', '/faq', '/privacy', '/email-confirmed', '/live/x']) {
      expect(isResumablePath(path), path).toBe(false)
    }
  })

  it('records an operator screen and restores it for the same operator on the next launch', async () => {
    recordResumeLocation('/game/g1', operator)
    await __flushResumeWriteForTests()
    await preloadResumeTarget()
    expect(resumeTarget(operator)).toBe('/game/g1')
  })

  it('never restores another identity into an operator screen', async () => {
    recordResumeLocation('/game/g1', operator)
    await __flushResumeWriteForTests()
    await preloadResumeTarget()
    expect(resumeTarget({ ...operator, userId: 'u-other' })).toBeNull()
    expect(resumeTarget(nobody)).toBeNull()
    expect(resumeTarget(player)).toBeNull()
  })

  it('restores the player map only for the same player session', async () => {
    recordResumeLocation('/base/b1', player)
    await __flushResumeWriteForTests()
    await preloadResumeTarget()
    expect(resumeTarget(player)).toBe('/base/b1')
    expect(resumeTarget({ ...player, playerId: 'p-2' })).toBeNull()
  })

  it('does not record a screen the current session cannot own', async () => {
    recordResumeLocation('/game/g1', nobody)
    recordResumeLocation('/map', operator)
    recordResumeLocation('/login', operator)
    await __flushResumeWriteForTests()
    expect(memory.size).toBe(0)
  })

  it('is consumed once, so returning to the root later does not bounce again', async () => {
    __setPreloadedForTests({ path: '/game/g1', userId: 'u-op', playerId: null, at: Date.now() })
    expect(resumeTarget(operator)).toBe('/game/g1')
    consumeResumeTarget()
    expect(resumeTarget(operator)).toBeNull()
  })

  it('ignores a stale record', () => {
    __setPreloadedForTests({ path: '/game/g1', userId: 'u-op', playerId: null, at: Date.now() - 8 * 24 * 60 * 60 * 1000 })
    expect(resumeTarget(operator)).toBeNull()
  })

  it('forgets the screen on sign-out', async () => {
    recordResumeLocation('/game/g1', operator)
    await __flushResumeWriteForTests()
    clearResumeLocation()
    await new Promise((r) => setTimeout(r, 0))
    expect(memory.size).toBe(0)
    await preloadResumeTarget()
    expect(resumeTarget(operator)).toBeNull()
  })

  it('does nothing in the browser', async () => {
    __setResumeEnabledForTests(false)
    recordResumeLocation('/game/g1', operator)
    await __flushResumeWriteForTests()
    expect(memory.size).toBe(0)
    __setPreloadedForTests({ path: '/game/g1', userId: 'u-op', playerId: null, at: Date.now() })
    expect(resumeTarget(operator)).toBeNull()
  })

  it('scopes account-only routes and never replays a tag proof', async () => {
    const account = { ...nobody, accountId: 'account-1' }
    recordResumeLocation('/dashboard?view=organize', account)
    await __flushResumeWriteForTests()
    await preloadResumeTarget()
    expect(resumeTarget(account)).toBe('/dashboard?view=organize')
    expect(resumeTarget({ ...account, accountId: 'account-2' })).toBeNull()
    recordResumeLocation('/base/b1?token=consumed-proof', player)
    await __flushResumeWriteForTests()
    await preloadResumeTarget()
    expect(resumeTarget(player)).toBe('/base/b1')
  })

  it('clears even when sign-out happens before the pending write completes', async () => {
    recordResumeLocation('/game/g1', operator)
    clearResumeLocation()
    await __flushResumeWriteForTests()
    await preloadResumeTarget()
    expect(resumeTarget(operator)).toBeNull()
  })
})
