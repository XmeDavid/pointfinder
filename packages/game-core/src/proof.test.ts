import { describe, expect, it } from 'vitest'
import { UnsupportedProofError, toCheckInRequest } from './proof'
import { StateVersionTracker, decideSnapshot } from './snapshot'

describe('proof mapping', () => {
  it('maps nfc and qr to the token body and refuses geo for now', () => {
    expect(toCheckInRequest({ type: 'nfc', token: 'abc' })).toEqual({ nfcToken: 'abc' })
    expect(toCheckInRequest({ type: 'qr', token: 'abc' })).toEqual({ nfcToken: 'abc' })
    expect(() => toCheckInRequest({ type: 'geo', lat: 0, lng: 0, accuracy: 5, capturedAt: 'x' })).toThrow(UnsupportedProofError)
  })
})

describe('snapshot decisions', () => {
  it('applies when behind or unknown, skips otherwise', () => {
    expect(decideSnapshot(null, 1)).toBe('apply')
    expect(decideSnapshot(5, 6)).toBe('apply')
    expect(decideSnapshot(6, 6)).toBe('skip')
    expect(decideSnapshot(7, 6)).toBe('skip')
  })

  it('tracks the highest version seen', () => {
    const t = new StateVersionTracker()
    expect(t.observe(undefined)).toBe(false)
    expect(t.observe(3)).toBe(true)
    expect(t.observe(2)).toBe(false)
    expect(t.observe(9)).toBe(true)
    expect(t.current).toBe(9)
  })
})
