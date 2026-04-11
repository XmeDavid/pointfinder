import { useState, useCallback, useRef, useEffect } from 'react'
import Map, { NavigationControl } from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DARK_STYLE_URL } from '@/lib/tile-sources'

interface GameMapProps {
  className?: string
  initialCenter?: [number, number]  // [lng, lat]
  initialZoom?: number
  children?: React.ReactNode
  mapStyle?: string
  /** Array of [lng, lat] points to fit the map bounds around on initial load */
  fitPoints?: [number, number][]
  /** Callback to receive the map ref instance for external control (flyTo, getCenter, etc.) */
  onMapRef?: (ref: MapRef | null) => void
  /** Called when the map background is clicked (not a marker) */
  onClick?: () => void
}

export function GameMap({
  className = 'h-full w-full',
  initialCenter = [-9.17, 38.7075],
  initialZoom = 13,
  children,
  mapStyle,
  fitPoints,
  onMapRef,
  onClick,
}: GameMapProps) {
  const mapRef = useRef<MapRef>(null)

  const setMapRef = useCallback((ref: MapRef | null) => {
    (mapRef as React.MutableRefObject<MapRef | null>).current = ref
    onMapRef?.(ref)
  }, [onMapRef])
  const hasFitted = useRef(false)

  const [viewState, setViewState] = useState({
    longitude: initialCenter[0],
    latitude: initialCenter[1],
    zoom: initialZoom,
  })

  const handleMove = useCallback((evt: { viewState: typeof viewState }) => {
    setViewState(evt.viewState)
  }, [])

  // Fit bounds once when points are available
  useEffect(() => {
    if (hasFitted.current || !fitPoints || fitPoints.length === 0 || !mapRef.current) return
    hasFitted.current = true

    if (fitPoints.length === 1) {
      mapRef.current.flyTo({ center: fitPoints[0], zoom: 15, duration: 800 })
      return
    }

    const lngs = fitPoints.map(p => p[0])
    const lats = fitPoints.map(p => p[1])
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, duration: 800 }
    )
  }, [fitPoints])

  return (
    <div className={className} data-testid="map-wrapper">
      <Map
        ref={setMapRef}
        {...viewState}
        onMove={handleMove}
        onClick={onClick}
        mapStyle={mapStyle ?? DARK_STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        <NavigationControl position="bottom-right" />
        {children}
      </Map>
    </div>
  )
}
