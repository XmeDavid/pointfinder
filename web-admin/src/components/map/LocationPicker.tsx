import { useState, useCallback } from 'react'
import Map, { Marker } from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DARK_STYLE_URL } from '@/lib/tile-sources'
import { PinMarkerSvg } from '@/components/common/MapMarkers'

interface LocationPickerProps {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
  className?: string
}

export function LocationPicker({
  lat,
  lng,
  onChange,
  className = '',
}: LocationPickerProps) {
  const [viewState, setViewState] = useState({
    longitude: lng || -9.17,
    latitude: lat || 38.7075,
    zoom: 15,
  })

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

  return (
    <div
      className={`h-48 rounded-lg border border-border overflow-hidden ${className}`}
      data-testid="location-picker"
    >
      <Map
        {...viewState}
        onMove={handleMove}
        onClick={handleClick}
        mapStyle={DARK_STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        cursor="crosshair"
      >
        {hasPosition && (
          <Marker longitude={lng} latitude={lat} anchor="bottom">
            <PinMarkerSvg color="#6366f1" />
          </Marker>
        )}
      </Map>
    </div>
  )
}
