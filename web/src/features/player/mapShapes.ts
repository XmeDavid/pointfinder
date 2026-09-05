const EARTH_RADIUS_M = 6_371_000

/**
 * A base's check-in radius as a GeoJSON polygon. MapLibre circle layers size in
 * screen pixels, so a ring that means metres on the ground has to be a polygon.
 */
export function circlePolygon(lat: number, lng: number, radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon, { radiusM: number }> {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const angular = radiusM / EARTH_RADIUS_M
  const lat1 = toRad(lat)
  const lng1 = toRad(lng)
  const ring: GeoJSON.Position[] = []
  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * i) / steps
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing))
    const lng2 = lng1 + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    )
    ring.push([toDeg(lng2), toDeg(lat2)])
  }
  ring[ring.length - 1] = [...ring[0]!]
  return { type: 'Feature', properties: { radiusM }, geometry: { type: 'Polygon', coordinates: [ring] } }
}

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
