import { describe, expect, it } from 'vitest'
import {
  CHECK_IN_METHODS,
  DEFAULT_CHECK_IN_RADIUS_M,
  MAX_CHECK_IN_RADIUS_M,
  MIN_CHECK_IN_RADIUS_M,
  isValidCheckInRadiusM,
  parseCheckInRadiusInput,
  resolveCheckInRadiusM,
} from './checkIn'

describe('check-in shared types', () => {
  it('lists the three methods in operator order', () => {
    expect(CHECK_IN_METHODS).toEqual(['NFC', 'QR', 'LOCATION'])
  })

  it('resolves a base radius, falling back to the game default', () => {
    expect(resolveCheckInRadiusM(40, 15)).toBe(40)
    expect(resolveCheckInRadiusM(null, 15)).toBe(15)
    expect(resolveCheckInRadiusM(undefined, 25)).toBe(25)
    expect(resolveCheckInRadiusM(null, undefined)).toBe(DEFAULT_CHECK_IN_RADIUS_M)
  })

  it('accepts only radii inside the server clamp', () => {
    expect(isValidCheckInRadiusM(MIN_CHECK_IN_RADIUS_M)).toBe(true)
    expect(isValidCheckInRadiusM(MAX_CHECK_IN_RADIUS_M)).toBe(true)
    expect(isValidCheckInRadiusM(4)).toBe(false)
    expect(isValidCheckInRadiusM(201)).toBe(false)
    expect(isValidCheckInRadiusM(Number.NaN)).toBe(false)
  })

  it('parses operator radius input, treating blank as inherit', () => {
    expect(parseCheckInRadiusInput('')).toEqual({ ok: true, value: null })
    expect(parseCheckInRadiusInput('   ')).toEqual({ ok: true, value: null })
    expect(parseCheckInRadiusInput('30')).toEqual({ ok: true, value: 30 })
    expect(parseCheckInRadiusInput('30.7')).toEqual({ ok: true, value: 31 })
    expect(parseCheckInRadiusInput('2')).toEqual({ ok: false })
    expect(parseCheckInRadiusInput('abc')).toEqual({ ok: false })
  })
})
