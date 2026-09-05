const EARTH_RADIUS_M = 6_371_000

/**
 * A metric circle as a GeoJSON polygon, so MapLibre can draw a ring that means
 * metres on the ground (circle layers size in screen pixels). Spherical
 * bearing projection: exact enough for the 5..200 m range radii are clamped to.
 */
export function circlePolygon(lat: number, lng: number, radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon, { radiusM: number }> {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const safeRadius = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 0
  const angular = safeRadius / EARTH_RADIUS_M
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
  return { type: 'Feature', properties: { radiusM: safeRadius }, geometry: { type: 'Polygon', coordinates: [ring] } }
}
