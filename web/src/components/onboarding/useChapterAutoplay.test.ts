import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AUTOPLAY_READING_PAUSE_MS, useChapterAutoplay } from './useChapterAutoplay'

const lifecycle = vi.hoisted(() => ({ foreground: true, listeners: new Set<(active: boolean) => void>() }))
vi.mock('@/platform/lifecycle', () => ({
  isForeground: () => lifecycle.foreground,
  onAppVisibility: (handler: (active: boolean) => void) => { lifecycle.listeners.add(handler); return () => lifecycle.listeners.delete(handler) },
}))

beforeEach(() => { vi.useFakeTimers(); lifecycle.foreground = true; lifecycle.listeners.clear() })
afterEach(() => { vi.useRealTimers() })

function subject(initial: { scene: string; active?: boolean; playing?: boolean; restartKey?: string }) {
  const onAdvance = vi.fn()
  const hook = renderHook((props: typeof initial) => useChapterAutoplay({ active: true, playing: true, restartKey: 'en', ...props, onAdvance }), { initialProps: initial })
  return { ...hook, onAdvance }
}

it('waits only for the scene currently requested and advances exactly once', () => {
  const { result, rerender, onAdvance } = subject({ scene: 'participant:0:125' })
  act(() => result.current.settle('participant:0:301'))
  expect(result.current.waiting).toBe(false)
  act(() => result.current.settle('participant:0:125'))
  expect(result.current.waiting).toBe(true)
  act(() => { vi.advanceTimersByTime(AUTOPLAY_READING_PAUSE_MS - 1) })
  expect(onAdvance).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(1) })
  expect(onAdvance).toHaveBeenCalledOnce()
  // A hold outlives a stage change (the organizer gate and its first chapter share a frame)...
  rerender({ scene: 'participant:0:125', active: false })
  rerender({ scene: 'participant:0:125', active: true })
  expect(result.current.waiting).toBe(true)
  // ...but never a scene change, even back to a scene held before.
  rerender({ scene: 'participant:0:301' })
  rerender({ scene: 'participant:0:125' })
  expect(result.current.waiting).toBe(false)
  act(() => { vi.advanceTimersByTime(AUTOPLAY_READING_PAUSE_MS * 2) })
  expect(onAdvance).toHaveBeenCalledOnce()
})

it('pauses, backgrounds and language changes each restart the full reading pause', () => {
  const { result, rerender, onAdvance } = subject({ scene: 'organizer:1:301' })
  act(() => result.current.settle('organizer:1:301'))
  act(() => { vi.advanceTimersByTime(2000) })
  rerender({ scene: 'organizer:1:301', playing: false })
  act(() => { vi.advanceTimersByTime(AUTOPLAY_READING_PAUSE_MS * 3) })
  expect(onAdvance).not.toHaveBeenCalled()
  rerender({ scene: 'organizer:1:301', playing: true })
  act(() => { vi.advanceTimersByTime(2000) })
  act(() => { lifecycle.foreground = false; lifecycle.listeners.forEach((listener) => listener(false)) })
  act(() => { vi.advanceTimersByTime(AUTOPLAY_READING_PAUSE_MS * 3) })
  expect(onAdvance).not.toHaveBeenCalled()
  act(() => { lifecycle.foreground = true; lifecycle.listeners.forEach((listener) => listener(true)) })
  act(() => { vi.advanceTimersByTime(2000) })
  rerender({ scene: 'organizer:1:301', restartKey: 'de' })
  act(() => { vi.advanceTimersByTime(AUTOPLAY_READING_PAUSE_MS - 1) })
  expect(onAdvance).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(1) })
  expect(onAdvance).toHaveBeenCalledOnce()
})

it('clears its timer and visibility listener on unmount', () => {
  const { result, unmount, onAdvance } = subject({ scene: 'participant:0:125' })
  act(() => result.current.settle('participant:0:125'))
  expect(lifecycle.listeners.size).toBe(1)
  unmount()
  expect(lifecycle.listeners.size).toBe(0)
  act(() => { vi.advanceTimersByTime(AUTOPLAY_READING_PAUSE_MS * 2) })
  expect(onAdvance).not.toHaveBeenCalled()
})
