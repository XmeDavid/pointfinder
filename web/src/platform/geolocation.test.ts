import { afterEach, describe, expect, it, vi } from 'vitest'
import * as runtime from './runtime'
import { openLocationSettings } from './geolocation'

afterEach(() => vi.restoreAllMocks())

describe('openLocationSettings', () => {
  it('does nothing in a browser, where there is no app settings page', async () => {
    vi.spyOn(runtime, 'isNative').mockReturnValue(false)
    await expect(openLocationSettings()).resolves.toBeUndefined()
  })

  it('never throws when the native settings screen refuses to open', async () => {
    vi.spyOn(runtime, 'isNative').mockReturnValue(true)
    await expect(openLocationSettings()).resolves.toBeUndefined()
  })
})
