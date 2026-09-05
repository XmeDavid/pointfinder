import { circlePolygon as sharedCircle } from '@/lib/geo/circle'

/** Operator-picker flavour of the shared circle: a centre object, no properties. */
export function circlePolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const feature = sharedCircle(center.lat, center.lng, radiusM, steps)
  return { type: 'Feature', properties: {}, geometry: feature.geometry }
}
