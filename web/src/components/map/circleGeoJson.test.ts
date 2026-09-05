import { describe, expect, it } from 'vitest'
import { distanceM } from '@pointfinder/game-core'
import { circlePolygon } from './circleGeoJson'

describe('circlePolygon', () => {
  it('produces a closed ring whose vertices sit on the radius', () => {
    const center = { lat: 38.7075, lng: -9.17 }
    const feature = circlePolygon(center, 50, 32)
    const ring = feature.geometry.coordinates[0]

    expect(feature.type).toBe('Feature')
    expect(feature.geometry.type).toBe('Polygon')
    expect(ring).toHaveLength(33)
    expect(ring[0]).toEqual(ring[ring.length - 1])

    for (const [lng, lat] of ring) {
      expect(distanceM(center, { lat, lng })).toBeCloseTo(50, 0)
    }
  })

  it('returns a degenerate ring for a non-positive radius', () => {
    const ring = circlePolygon({ lat: 0, lng: 0 }, 0, 8).geometry.coordinates[0]
    for (const [lng, lat] of ring) {
      expect(lat).toBe(0)
      expect(lng).toBe(0)
    }
  })
})
