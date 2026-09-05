/**
 * Approximate a metric circle as a GeoJSON polygon so MapLibre can draw a
 * check-in radius without a turf dependency. Accurate enough for the 5..200 m
 * range the product clamps radii to.
 */
const EARTH_RADIUS_M = 6_371_000

export function circlePolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const safeRadius = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 0
  const latRad = (center.lat * Math.PI) / 180
  const dLat = (safeRadius / EARTH_RADIUS_M) * (180 / Math.PI)
  const cosLat = Math.cos(latRad)
  const dLng = cosLat === 0 ? 0 : dLat / cosLat

  const ring: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    ring.push([center.lng + dLng * Math.cos(angle), center.lat + dLat * Math.sin(angle)])
  }
  ring.push(ring[0])

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}
