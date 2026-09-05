import { beforeEach, describe, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ enabled: false }))
const values = vi.hoisted(() => new Map<string, string>())
vi.mock('./runtime', () => ({ isNative: () => native.enabled }))
vi.mock('tauri-plugin-pointfinder-secure-store-api', () => ({
  get: vi.fn(async (key: string) => values.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => { values.set(key, value) }),
  remove: vi.fn(async (key: string) => { values.delete(key) }),
}))
import { clearOperatorSession, loadOperatorSession, operatorRefreshBody, saveOperatorSession, takeOperatorRefreshBody } from './operatorSession'
const user = { id: 'u', name: 'Operator', email: 'op@example.test', role: 'operator' as const, createdAt: '' }
beforeEach(() => { native.enabled = false; values.clear() })
describe('operator session platform boundary', () => {
  it('clears a finishing native save before persisting the next account', async () => {
    native.enabled = true
    const store = await import('tauri-plugin-pointfinder-secure-store-api')
    let release!: () => void
    vi.mocked(store.set).mockImplementationOnce(async (key, value) => {
      await new Promise<void>((resolve) => { release = resolve })
      values.set(key, value)
    })
    const oldSave = saveOperatorSession({ accessToken: 'old', refreshToken: 'old-refresh', user })
    await vi.waitFor(() => expect(release).toBeDefined())
    const logout = takeOperatorRefreshBody()
    const newSave = saveOperatorSession({ accessToken: 'new', refreshToken: 'new-refresh', user: { ...user, id: 'next' } })
    release()
    await oldSave
    expect(await logout).toEqual({ refreshToken: 'old-refresh' })
    await newSave
    expect(await loadOperatorSession()).toMatchObject({ accessToken: 'new', user: { id: 'next' } })
  })
  it('leaves browser refresh tokens exclusively in cookies', async () => {
    await saveOperatorSession({ accessToken: 'access', refreshToken: 'sensitive', user })
    expect(await operatorRefreshBody()).toEqual({})
    expect(await loadOperatorSession()).toBeNull()
    expect(values.size).toBe(0)
  })
  it('persists rotated native credentials and clears them on logout', async () => {
    native.enabled = true
    await saveOperatorSession({ accessToken: 'a1', refreshToken: 'r1', user })
    expect(await operatorRefreshBody()).toEqual({ refreshToken: 'r1' })
    await saveOperatorSession({ accessToken: 'a2', refreshToken: 'r2', user })
    expect(await operatorRefreshBody()).toEqual({ refreshToken: 'r2' })
    expect(await loadOperatorSession()).toMatchObject({ user, accessToken: 'a2' })
    await clearOperatorSession()
    expect(await loadOperatorSession()).toBeNull()
  })
  it('migrates the previous Tauri operator session without touching a player session', async () => {
    native.enabled = true
    values.set('auth', JSON.stringify({ kind: 'operator', userId: user.id, userName: user.name, email: user.email, role: user.role, accessToken: 'a', refreshToken: 'r' }))
    expect(await loadOperatorSession()).toMatchObject({ kind: 'operator', user, refreshToken: 'r' })
    expect(values.has('auth')).toBe(false)
    await clearOperatorSession()
    values.set('auth', JSON.stringify({ kind: 'player', token: 'player' }))
    expect(await loadOperatorSession()).toBeNull()
    expect(values.has('auth')).toBe(true)
  })
})
