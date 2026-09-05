import { describe, expect, it } from 'vitest'
import { distanceM } from '@pointfinder/game-core'
import { circlePolygon, radiusCollection } from './mapShapes'

describe('circlePolygon', () => {
  it('closes the ring and keeps every vertex at the requested radius', () => {
    const feature = circlePolygon(40.09, -8.87, 50, 32)
    const ring = feature.geometry.coordinates[0]!
    expect(ring).toHaveLength(33)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    for (const [lng, lat] of ring) {
      expect(distanceM({ lat: lat!, lng: lng! }, { lat: 40.09, lng: -8.87 })).toBeCloseTo(50, 0)
    }
  })

  it('carries the radius as a property for the label layer', () => {
    expect(circlePolygon(40.09, -8.87, 25).properties.radiusM).toBe(25)
  })
})

describe('radiusCollection', () => {
  it('builds one polygon per base and nothing for an empty list', () => {
    const collection = radiusCollection([
      { baseId: 'b1', lat: 40.09, lng: -8.87, radiusM: 20 },
      { baseId: 'b2', lat: 40.10, lng: -8.88, radiusM: 40 },
    ])
    expect(collection.type).toBe('FeatureCollection')
    expect(collection.features).toHaveLength(2)
    expect(collection.features.map((f) => f.id)).toEqual(['b1', 'b2'])
    expect(radiusCollection([]).features).toEqual([])
  })
})
