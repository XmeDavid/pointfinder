import { describe, expect, it } from 'vitest'
import type { CheckInRequest } from '@pointfinder/api'
import { proofTypeForMethod, toCheckInRequest, type CheckInRequestBody } from './proof'
import { StateVersionTracker, decideSnapshot } from './snapshot'

/** game-core's body must be exactly what the api package declares on the wire. */
const wire: (b: CheckInRequestBody) => CheckInRequest = (b) => b

describe('proof mapping', () => {
  it('maps a tag tap and a scanned code to their own method', () => {
    expect(toCheckInRequest({ type: 'nfc', token: 'ab12cd34' })).toEqual({ method: 'nfc', token: 'ab12cd34' })
    expect(toCheckInRequest({ type: 'qr', token: 'ab12cd34' })).toEqual({ method: 'qr', token: 'ab12cd34' })
  })

  it('maps an automatic fix without a dwell buffer', () => {
    const body = toCheckInRequest({ type: 'geo', lat: 41.1, lng: -8.6, accuracy: 8.5, capturedAt: '2026-09-05T10:00:00Z', claimed: false })
    expect(body).toEqual({ method: 'geo', lat: 41.1, lng: -8.6, accuracy: 8.5, capturedAt: '2026-09-05T10:00:00Z', claimed: false })
    expect(wire(body)).toBe(body)
  })

  it('carries the dwell buffer of a claim', () => {
    const dwell = [{ lat: 41.1, lng: -8.6, accuracy: 30, capturedAt: '2026-09-05T09:58:50Z' }]
    const body = toCheckInRequest({ type: 'geo', lat: 41.1, lng: -8.6, accuracy: 22, capturedAt: '2026-09-05T10:00:00Z', claimed: true, dwell })
    expect(body).toEqual({ method: 'geo', lat: 41.1, lng: -8.6, accuracy: 22, capturedAt: '2026-09-05T10:00:00Z', claimed: true, dwell })
    expect(wire(body)).toBe(body)
  })

  it('names the proof a base of each method asks for', () => {
    expect(proofTypeForMethod('NFC')).toBe('nfc')
    expect(proofTypeForMethod('QR')).toBe('qr')
    expect(proofTypeForMethod('LOCATION')).toBe('geo')
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
