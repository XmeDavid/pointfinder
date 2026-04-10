import { describe, it, expect, vi, afterEach } from 'vitest'
import { relativeTime, formatElapsed } from './dates'

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for timestamps less than 10 seconds ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:10Z'))
    expect(relativeTime('2026-01-01T12:00:05Z')).toBe('just now')
  })

  it('returns seconds ago for timestamps 10-59 seconds ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:30Z'))
    expect(relativeTime('2026-01-01T12:00:00Z')).toBe('30s ago')
  })

  it('returns minutes ago for timestamps 1-59 minutes ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:15:00Z'))
    expect(relativeTime('2026-01-01T12:00:00Z')).toBe('15m ago')
  })

  it('returns hours ago for timestamps 1-23 hours ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T15:00:00Z'))
    expect(relativeTime('2026-01-01T12:00:00Z')).toBe('3h ago')
  })

  it('returns days ago for timestamps 24+ hours ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-03T12:00:00Z'))
    expect(relativeTime('2026-01-01T12:00:00Z')).toBe('2d ago')
  })

  it('returns "just now" for timestamps less than 1 second ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00.500Z'))
    expect(relativeTime('2026-01-01T12:00:00.000Z')).toBe('just now')
  })
})

describe('formatElapsed', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats elapsed time as HH:MM:SS', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T13:30:45Z'))
    expect(formatElapsed('2026-01-01T12:00:00Z')).toBe('01:30:45')
  })

  it('returns 00:00:00 for current timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    expect(formatElapsed('2026-01-01T12:00:00Z')).toBe('00:00:00')
  })

  it('clamps negative elapsed to 00:00:00', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T11:00:00Z'))
    expect(formatElapsed('2026-01-01T12:00:00Z')).toBe('00:00:00')
  })

  it('pads single-digit values', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:05:03Z'))
    expect(formatElapsed('2026-01-01T12:00:00Z')).toBe('00:05:03')
  })
})
