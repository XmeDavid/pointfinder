import { afterEach, describe, expect, it } from 'vitest'
import { configureNativeViewport, isNativeEntry } from './runtime'

const originalViewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content
const hadViewport = document.querySelector('meta[name="viewport"]') !== null

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!hadViewport) viewport?.remove()
  else if (viewport && originalViewport) viewport.content = originalViewport
})

describe('native runtime', () => {
  it('uses the mobile entry point and disables page zoom inside Tauri', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
      ?? document.head.appendChild(document.createElement('meta'))
    viewport.name = 'viewport'

    configureNativeViewport()

    expect(isNativeEntry()).toBe(true)
    expect(viewport.content).toContain('maximum-scale=1.0')
    expect(viewport.content).toContain('user-scalable=no')
  })
})
