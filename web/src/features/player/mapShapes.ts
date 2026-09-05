import { circlePolygon } from '@/lib/geo/circle'

export { circlePolygon }

export const CHECK_IN_RADIUS_SOURCE_ID = 'player-check-in-radius'
export const CHECK_IN_RADIUS_FILL_LAYER_ID = 'player-check-in-radius-fill'
export const CHECK_IN_RADIUS_LINE_LAYER_ID = 'player-check-in-radius-line'

/** One polygon per visible location base. Hidden bases are never passed in. */
export function radiusCollection(bases: Array<{ baseId: string; lat: number; lng: number; radiusM: number }>): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: bases.map((b) => ({ ...circlePolygon(b.lat, b.lng, b.radiusM), id: b.baseId })),
  }
}
