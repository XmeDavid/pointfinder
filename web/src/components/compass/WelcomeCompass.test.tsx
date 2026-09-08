import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WelcomeCompass } from './WelcomeCompass'

const mocks = vi.hoisted(() => ({
  watch: vi.fn(), stop: vi.fn(), active: true,
  visibility: undefined as undefined | (() => void),
}))
vi.mock('@/platform/orientation', () => ({ watchDeviceOrientation: mocks.watch }))
vi.mock('@/platform/lifecycle', () => ({
  isForeground: () => mocks.active,
  onAppVisibility: (fn: () => void) => { mocks.visibility = fn; return () => {} },
}))
let reduced = false
let mediaChange: (() => void) | undefined
beforeEach(() => {
  vi.clearAllMocks()
  mocks.active = true
  reduced = false
  mocks.watch.mockReturnValue(mocks.stop)
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced },
    addEventListener: (_: string, fn: () => void) => { mediaChange = fn },
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

it('stops sensors and animation on background, reduced motion and unmount', () => {
  const { getByTestId, unmount } = render(<WelcomeCompass />)
  expect(mocks.watch).toHaveBeenCalledOnce()
  act(() => { mocks.active = false; mocks.visibility?.() })
  expect(mocks.stop).toHaveBeenCalledOnce()
  expect(getByTestId('welcome-compass')).toHaveAttribute('data-motion', 'paused')
  act(() => { mocks.active = true; mocks.visibility?.() })
  expect(mocks.watch).toHaveBeenCalledTimes(2)
  act(() => { reduced = true; mediaChange?.() })
  expect(mocks.stop).toHaveBeenCalledTimes(2)
  expect(getByTestId('welcome-compass-rose')).toHaveStyle({ transform: 'none' })
  act(() => { reduced = false; mediaChange?.() })
  expect(mocks.watch).toHaveBeenCalledTimes(3)
  unmount()
  expect(mocks.stop).toHaveBeenCalledTimes(3)
})

it('never starts a sensor or a frame when reduced motion is already enabled', () => {
  reduced = true
  render(<WelcomeCompass />)
  expect(mocks.watch).not.toHaveBeenCalled()
  expect(requestAnimationFrame).not.toHaveBeenCalled()
})

it('applies native heading and bounded tilt without rotating the long way across north', () => {
  const { getByTestId } = render(<WelcomeCompass />)
  const emit = mocks.watch.mock.calls[0][0]
  emit({ heading: 359, pitch: 80, roll: -80 })
  const raf = vi.mocked(requestAnimationFrame)
  let time = performance.now()
  for (let i = 0; i < 60; i++) {
    time += 16
    raf.mock.calls.at(-1)![0](time)
  }
  const transform = getByTestId('welcome-compass-rose').style.transform
  const angles = [...transform.matchAll(/rotate[XYZ]\(([-\d.]+)deg\)/g)].map((match) => Number(match[1]))
  expect(angles[0]).toBeGreaterThan(24)
  expect(angles[0]).toBeLessThanOrEqual(25)
  expect(angles[1]).toBeGreaterThan(24)
  expect(angles[2]).toBeGreaterThan(0)
  expect(angles[2]).toBeLessThanOrEqual(1)
})
