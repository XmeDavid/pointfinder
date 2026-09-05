import { useState, useCallback, useEffect, useMemo } from 'react'
import Map, { Layer, Marker, Source } from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DARK_STYLE_URL } from '@/lib/tile-sources'
import { PinMarkerSvg } from '@/components/common/MapMarkers'
import { circlePolygon } from './circleGeoJson'

interface LocationPickerProps {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
  className?: string
  mapStyle?: string
  /** Draws the check-in radius as a faint ring. Omit for non-location bases. */
  radiusM?: number | null
}

export function LocationPicker({
  lat,
  lng,
  onChange,
  className = '',
  mapStyle,
  radiusM,
}: LocationPickerProps) {
  const [viewState, setViewState] = useState({
    longitude: lng || -9.17,
    latitude: lat || 38.7075,
    zoom: 15,
  })

  // Recenter when base changes
  useEffect(() => {
    if (lat !== 0 || lng !== 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewState(prev => ({ ...prev, latitude: lat, longitude: lng }))
    }
  }, [lat, lng])

  const handleMove = useCallback(
    (evt: { viewState: typeof viewState }) => {
      setViewState(evt.viewState)
    },
    [],
  )

  const handleClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      onChange(
        Math.round(evt.lngLat.lat * 1_000_000) / 1_000_000,
        Math.round(evt.lngLat.lng * 1_000_000) / 1_000_000,
      )
    },
    [onChange],
  )

  const hasPosition = lat !== 0 || lng !== 0
  const showRadius = hasPosition && typeof radiusM === 'number' && radiusM > 0

  const radiusFeature = useMemo(
    () => (showRadius ? circlePolygon({ lat, lng }, radiusM as number) : null),
    [showRadius, lat, lng, radiusM],
  )

  return (
    <div
      className={`h-48 rounded-lg border border-border overflow-hidden ${className}`}
      data-testid="location-picker"
    >
      <Map
        {...viewState}
        onMove={handleMove}
        onClick={handleClick}
        mapStyle={mapStyle ?? DARK_STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        cursor="crosshair"
      >
        {radiusFeature && (
          <Source id="checkin-radius" type="geojson" data={radiusFeature}>
            <Layer
              id="checkin-radius-fill"
              type="fill"
              paint={{ 'fill-color': 'var(--color-info)', 'fill-opacity': 0.12 }}
            />
            <Layer
              id="checkin-radius-line"
              type="line"
              paint={{ 'line-color': 'var(--color-info)', 'line-width': 1.5, 'line-opacity': 0.6 }}
            />
          </Source>
        )}
        {hasPosition && (
          <Marker longitude={lng} latitude={lat} anchor="bottom">
            <PinMarkerSvg color="var(--color-info)" />
          </Marker>
        )}
      </Map>
    </div>
  )
}
