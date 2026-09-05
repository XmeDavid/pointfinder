import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applySafeAreaInsets, initializeSafeArea, type SafeAreaInsets } from './safeArea'

const mocks = vi.hoisted(() => ({
  native: false,
  invoke: vi.fn(),
  listen: vi.fn(),
  unregister: vi.fn(),
  stopForeground: vi.fn(),
}))
vi.mock('./runtime', () => ({ isNative: () => mocks.native }))
vi.mock('./lifecycle', () => ({ onForeground: () => mocks.stopForeground }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke, addPluginListener: mocks.listen }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.native = false
  mocks.listen.mockResolvedValue({ unregister: mocks.unregister })
})
afterEach(() => document.documentElement.removeAttribute('style'))

describe('native safe areas', () => {
  it('keeps browser CSS env() intact without invoking native plugins', async () => {
    const stop = await initializeSafeArea()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(document.documentElement.style.length).toBe(0)
    stop()
  })

  it('replaces all four edges on rotation, including zero, and rejects malformed measurements', () => {
    applySafeAreaInsets({ top: 59, right: 0, bottom: 34, left: 0 })
    applySafeAreaInsets({ top: 0, right: 59, bottom: 21, left: 59 })
    expect(document.documentElement.style.getPropertyValue('--native-safe-top')).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--native-safe-left')).toBe('59px')
    applySafeAreaInsets({ top: NaN, right: 0, bottom: -1, left: 0 })
    expect(document.documentElement.style.getPropertyValue('--native-safe-bottom')).toBe('21px')
  })

  it('does not let an old initial read overwrite a newer layout event or a disposed session', async () => {
    mocks.native = true
    let finish!: (value: SafeAreaInsets) => void
    mocks.invoke.mockImplementation(() => new Promise<SafeAreaInsets>((resolve) => { finish = resolve }))
    const starting = initializeSafeArea()
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalled())
    const changed = mocks.listen.mock.calls[0][2] as (insets: SafeAreaInsets) => void
    changed({ top: 0, right: 44, bottom: 21, left: 44 })
    finish({ top: 47, right: 0, bottom: 34, left: 0 })
    const stop = await starting
    expect(document.documentElement.style.getPropertyValue('--native-safe-bottom')).toBe('21px')
    stop()
    changed({ top: 47, right: 0, bottom: 34, left: 0 })
    window.dispatchEvent(new Event('resize'))
    expect(document.documentElement.style.getPropertyValue('--native-safe-bottom')).toBe('21px')
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.unregister).toHaveBeenCalledOnce()
    expect(mocks.stopForeground).toHaveBeenCalledOnce()
  })
})
