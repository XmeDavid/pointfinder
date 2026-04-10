import { useState, useCallback } from 'react'
import Map, { NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

interface GameMapProps {
  className?: string
  initialCenter?: [number, number]  // [lng, lat]
  initialZoom?: number
  children?: React.ReactNode
}

export function GameMap({
  className = 'h-full w-full',
  initialCenter = [-9.17, 38.7075],  // Lisbon
  initialZoom = 13,
  children,
}: GameMapProps) {
  const [viewState, setViewState] = useState({
    longitude: initialCenter[0],
    latitude: initialCenter[1],
    zoom: initialZoom,
  })

  const handleMove = useCallback((evt: { viewState: typeof viewState }) => {
    setViewState(evt.viewState)
  }, [])

  return (
    <div className={className} data-testid="map-wrapper">
      <Map
        {...viewState}
        onMove={handleMove}
        mapStyle={DARK_STYLE}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        <NavigationControl position="bottom-right" />
        {children}
      </Map>
    </div>
  )
}
