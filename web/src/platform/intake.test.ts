import { describe, expect, it, vi } from 'vitest'
import { createNativeIntake } from './intake'

describe('native launch event intake', () => {
  it('keeps a cold-start event through React remount while registration is pending', async () => {
    let ready!: () => void
    const initialize = vi.fn(async (emit: (value: string) => void) => {
      await new Promise<void>((resolve) => { ready = resolve })
      emit('launch-tag')
    })
    const listen = createNativeIntake(initialize)
    const controller = new AbortController()
    const first = vi.fn()
    const pending = listen(first, { signal: controller.signal })
    controller.abort()
    const second = vi.fn()
    const active = listen(second)
    ready()
    await Promise.all([pending, active])
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledExactlyOnceWith('launch-tag')
    expect(initialize).toHaveBeenCalledTimes(1)
  })
  it('does not reopen the launch URL when the user navigates to another route', async () => {
    const initialize = vi.fn(async (emit: (value: string) => void) => { emit('launch-url') })
    const listen = createNativeIntake(initialize)
    const first = vi.fn()
    const off = await listen(first)
    off()
    const second = vi.fn()
    await listen(second)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(initialize).toHaveBeenCalledTimes(1)
  })
  it('buffers the latest event during a gap between active subscribers', async () => {
    let emit!: (value: string) => void
    const listen = createNativeIntake<string>(async (handler) => { emit = handler })
    const off = await listen(vi.fn())
    off()
    emit('old'); emit('latest')
    const handler = vi.fn()
    await listen(handler)
    expect(handler).toHaveBeenCalledExactlyOnceWith('latest')
  })
})
