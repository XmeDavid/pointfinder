import { describe, expect, it } from 'vitest'
import { decideSend, distanceM, freshness, representativePerTeam } from './location'

const base = { lat: 38.7, lng: -9.1 }
const fix = (over: Partial<{ lat: number; lng: number; accuracy: number; capturedAt: number }> = {}) => ({
  lat: base.lat,
  lng: base.lng,
  accuracy: 8,
  capturedAt: 100_000,
  ...over,
})

describe('decideSend', () => {
  it('rejects inaccurate and stale fixes', () => {
    expect(decideSend(fix({ accuracy: 80 }), null, null, 100_000)).toEqual({ send: false, reason: 'inaccurate' })
    expect(decideSend(fix({ accuracy: 0 }), null, null, 100_000)).toEqual({ send: false, reason: 'inaccurate' })
    expect(decideSend(fix({ capturedAt: 0 }), null, null, 100_000)).toEqual({ send: false, reason: 'stale' })
  })

  it('sends the first good fix, then respects the minimum interval', () => {
    expect(decideSend(fix(), null, null, 100_000)).toEqual({ send: true, reason: 'first' })
    expect(decideSend(fix({ capturedAt: 102_000 }), fix(), 100_000, 102_000)).toEqual({ send: false, reason: 'too_soon' })
  })

  it('sends on movement and on the heartbeat, otherwise reports unchanged', () => {
    const moved = fix({ lat: base.lat + 0.0003, capturedAt: 110_000 })
    expect(decideSend(moved, fix(), 100_000, 110_000)).toEqual({ send: true, reason: 'moved' })
    expect(decideSend(fix({ capturedAt: 110_000 }), fix(), 100_000, 110_000)).toEqual({ send: false, reason: 'unchanged' })
    expect(decideSend(fix({ capturedAt: 131_000 }), fix(), 100_000, 131_000)).toEqual({ send: true, reason: 'heartbeat' })
  })
})

describe('freshness and distance', () => {
  it('classifies ages', () => {
    const now = Date.parse('2026-09-04T12:00:00Z')
    expect(freshness('2026-09-04T11:59:30Z', now)).toBe('live')
    expect(freshness('2026-09-04T11:57:00Z', now)).toBe('aging')
    expect(freshness('2026-09-04T11:50:00Z', now)).toBe('stale')
    expect(freshness('garbage', now)).toBe('stale')
  })

  it('measures metres', () => {
    expect(distanceM(base, base)).toBe(0)
    expect(Math.round(distanceM(base, { lat: base.lat + 0.001, lng: base.lng }))).toBe(111)
  })

  it('keeps the freshest position per team', () => {
    const m = representativePerTeam([
      { teamId: 'a', updatedAt: '2026-01-01T00:00:00Z', playerId: '1' },
      { teamId: 'a', updatedAt: '2026-01-01T00:00:05Z', playerId: '2' },
      { teamId: 'b', updatedAt: '2026-01-01T00:00:01Z', playerId: '3' },
    ])
    expect(m.get('a')?.playerId).toBe('2')
    expect(m.get('b')?.playerId).toBe('3')
  })
})
