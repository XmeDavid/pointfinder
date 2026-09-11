import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearStaleBundleFlag, isStaleChunkError, recoverFromStaleBundle } from './staleBundle'

function fakeWindow() {
  const listeners = new Map<string, EventListener[]>()
  const store = new Map<string, string>()
  const reload = vi.fn()
  const win = {
    addEventListener: (type: string, fn: EventListener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type: string, fn: EventListener) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)),
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    location: { reload },
  } as unknown as Window
  const fire = (type: string, event: Event) => (listeners.get(type) ?? []).forEach((fn) => fn(event))
  return { win, fire, reload, store }
}

describe('recoverFromStaleBundle', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reloads once on a failed chunk preload, then stops so a broken build cannot loop', () => {
    const { win, fire, reload, store } = fakeWindow()
    recoverFromStaleBundle(win)
    const event = new Event('vite:preloadError', { cancelable: true })
    fire('vite:preloadError', event)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    fire('vite:preloadError', new Event('vite:preloadError', { cancelable: true }))
    expect(reload).toHaveBeenCalledTimes(1)
    clearStaleBundleFlag(win)
    expect(store.size).toBe(0)
  })

  it('reloads on a rejected dynamic import but leaves other rejections alone', () => {
    const { win, fire, reload } = fakeWindow()
    recoverFromStaleBundle(win)
    const other = { reason: new Error('Network error'), preventDefault: vi.fn() } as unknown as Event
    fire('unhandledrejection', other)
    expect(reload).not.toHaveBeenCalled()
    const stale = { reason: new TypeError('error loading dynamically imported module: https://x/assets/Welcome-1.js'), preventDefault: vi.fn() } as unknown as Event
    fire('unhandledrejection', stale)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('recognises the chunk failure messages of the major browsers', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: x'))).toBe(true)
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new Error('boom'))).toBe(false)
  })
})
