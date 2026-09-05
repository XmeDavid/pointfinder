import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startPushRegistration, type PushIdentity } from './pushRegistration'

const push = vi.hoisted(() => ({
  pushPermission: vi.fn(), registerPush: vi.fn(), unregisterPush: vi.fn(async () => {}),
  onPushToken: vi.fn(async () => () => {}), onPushPermissionChange: vi.fn(() => () => {}),
}))
vi.mock('./push', () => push)
vi.mock('./lifecycle', () => ({ onForeground: () => () => {} }))
beforeEach(() => {
  vi.clearAllMocks()
  push.pushPermission.mockResolvedValue('granted')
  push.registerPush.mockResolvedValue({ token: 'device', platform: 'android' })
})
function fixture() {
  const first: PushIdentity = { key: 'alice', register: vi.fn(async () => {}), unregister: vi.fn(async () => {}) }
  let identity: PushIdentity | null = first
  let change = () => {}
  const stop = startPushRegistration({ identity: () => identity, onIdentityChange: (handler) => { change = handler; return () => {} } })
  return { first, stop, switchTo: (next: PushIdentity | null) => { identity = next; change() } }
}
describe('push registration lifecycle', () => {
  it('does not request permission or register until the user grants it', async () => {
    push.pushPermission.mockResolvedValue('prompt')
    const f = fixture()
    await vi.waitFor(() => expect(push.pushPermission).toHaveBeenCalled())
    expect(push.registerPush).not.toHaveBeenCalled()
    expect(f.first.register).not.toHaveBeenCalled()
    f.stop()
  })
  it('retries a failed backend registration on reconnect and deduplicates successful registrations', async () => {
    const f = fixture()
    vi.mocked(f.first.register).mockRejectedValueOnce(new Error('offline'))
    await vi.waitFor(() => expect(f.first.register).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(f.first.register).toHaveBeenCalledTimes(2))
    window.dispatchEvent(new Event('online'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(f.first.register).toHaveBeenCalledTimes(2)
    f.stop()
  })
  it('detaches the previous identity before binding the device to the next one', async () => {
    const f = fixture()
    await vi.waitFor(() => expect(f.first.register).toHaveBeenCalledTimes(1))
    const register = vi.fn(async () => {
      expect(f.first.unregister).toHaveBeenCalledWith({ token: 'device', platform: 'android' })
      expect(push.unregisterPush).toHaveBeenCalledTimes(1)
    })
    f.switchTo({ key: 'bob', register, unregister: vi.fn() })
    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1))
    f.stop()
  })
  it('tears down a registration that finishes after logout instead of binding a new account', async () => {
    const f = fixture()
    let finish!: () => void
    vi.mocked(f.first.register).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await vi.waitFor(() => expect(f.first.register).toHaveBeenCalledTimes(1))
    f.switchTo(null)
    finish()
    await vi.waitFor(() => expect(f.first.unregister).toHaveBeenCalledTimes(1))
    expect(push.unregisterPush).toHaveBeenCalledTimes(1)
    f.stop()
  })
})
