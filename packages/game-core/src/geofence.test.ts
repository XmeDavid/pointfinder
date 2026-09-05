import { describe, expect, it } from 'vitest'
import {
  AUTO_ACCURACY_CAP_M,
  CLAIM_ACCURACY_CAP_M,
  DWELL_MIN_FIXES,
  autoAccepts,
  dwellSatisfied,
  insideWideRing,
  pushDwellSample,
  wideRingM,
} from './geofence'
import type { Fix } from './location'

const base = { lat: 40.09, lng: -8.87 }
/** One degree of latitude here is ~111.19 km, so 0.0001 is ~11.1 m. */
const at = (metresNorth: number, accuracy: number, capturedAt = 0): Fix => ({
  lat: base.lat + metresNorth / 111_194.9,
  lng: base.lng,
  accuracy,
  capturedAt,
})

describe('automatic acceptance', () => {
  it('accepts a fix inside the radius', () => {
    const result = autoAccepts(at(0, 8), base, 15)
    expect(result.ok).toBe(true)
    expect(Math.round(result.distanceM)).toBe(0)
  })

  it('credits accuracy up to thirty metres and no further', () => {
    expect(autoAccepts(at(22, 5), base, 15).ok).toBe(false)
    expect(autoAccepts(at(22, 10), base, 15).ok).toBe(true)
    expect(autoAccepts(at(56, 40), base, 15)).toMatchObject({ ok: false, allowedM: 45, reason: 'out_of_range' })
  })

  it('refuses a fix the chip cannot vouch for', () => {
    expect(autoAccepts(at(0, AUTO_ACCURACY_CAP_M + 1), base, 15)).toMatchObject({ ok: false, reason: 'inaccurate' })
    expect(autoAccepts(at(0, Number.NaN), base, 15)).toMatchObject({ ok: false, reason: 'inaccurate' })
    expect(autoAccepts(at(0, 0), base, 15)).toMatchObject({ ok: false, reason: 'inaccurate' })
  })

  it('reports the distance and the allowance a refusal was measured against', () => {
    expect(autoAccepts(at(100, 10), base, 15)).toMatchObject({ allowedM: 25, reason: 'out_of_range' })
    expect(Math.round(autoAccepts(at(100, 10), base, 15).distanceM)).toBe(100)
  })
})

describe('the wider ring a claim may be made from', () => {
  it('is three radii, never under fifty metres', () => {
    expect(wideRingM(15)).toBe(50)
    expect(wideRingM(30)).toBe(90)
  })

  it('answers whether a fix stands inside it', () => {
    expect(insideWideRing(at(44, 90), base, 15)).toBe(true)
    expect(insideWideRing(at(56, 90), base, 15)).toBe(false)
  })
})

describe('dwell', () => {
  const buffer = [at(0, 30, 0), at(0, 30, 20_000), at(0, 30, 40_000), at(0, 30, 60_000)]

  it('needs four fixes spread over a minute, still current', () => {
    expect(dwellSatisfied(buffer, 90_000)).toBe(true)
    expect(buffer).toHaveLength(DWELL_MIN_FIXES)
  })

  it('refuses too few fixes, too short a span, or a stale buffer', () => {
    expect(dwellSatisfied(buffer.slice(1), 90_000)).toBe(false)
    expect(dwellSatisfied([at(0, 30, 0), at(0, 30, 15_000), at(0, 30, 30_000), at(0, 30, 50_000)], 60_000)).toBe(false)
    expect(dwellSatisfied(buffer, 60_000 + 120_001)).toBe(false)
  })

  it('refuses a buffer holding a fix coarser than the claim cap', () => {
    expect(dwellSatisfied([...buffer.slice(1), at(0, CLAIM_ACCURACY_CAP_M + 1, 80_000)], 90_000)).toBe(false)
  })

  it('samples at most every ten seconds', () => {
    const one = [at(0, 30, 100_000)]
    expect(pushDwellSample(one, at(0, 30, 105_000))).toBe(one)
    expect(pushDwellSample(one, at(0, 30, 110_000))).toHaveLength(2)
    expect(pushDwellSample([], at(0, 30, 0))).toHaveLength(1)
  })

  it('forgets samples older than five minutes', () => {
    expect(pushDwellSample([at(0, 30, 0), at(0, 30, 20_000)], at(0, 30, 400_000)).map((f) => f.capturedAt)).toEqual([400_000])
  })
})
