import { useState, useCallback, useRef, useEffect } from 'react'
import Map, { NavigationControl } from 'react-map-gl/maplibre'
import type { MapMouseEvent, MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DARK_STYLE_URL } from '@/lib/tile-sources'
import { useTranslation } from 'react-i18next'
import { onForeground } from '@/platform/lifecycle'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  onClick?: (event: MapMouseEvent) => void
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
  const { t } = useTranslation()
  const mapRef = useRef<MapRef>(null)
  const loaded = useRef(false)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const retry = () => {
    loaded.current = false
    setStatus('loading')
    setAttempt((value) => value + 1)
  }
  useEffect(() => {
    if (status !== 'loading') return
    const timeout = window.setTimeout(() => {
      if (!loaded.current) setStatus('error')
    }, 15_000)
    return () => window.clearTimeout(timeout)
  }, [attempt, status])
  useEffect(() => onForeground(() => {
    const map = mapRef.current?.getMap()
    map?.resize()
    map?.triggerRepaint()
  }), [])

  const stopMapEvents = useRef<(() => void) | undefined>(undefined)
  const setMapRef = useCallback((ref: MapRef | null) => {
    stopMapEvents.current?.()
    mapRef.current = ref
    if (ref) {
      const map = ref.getMap()
      const lost = () => { loaded.current = false; setStatus('error') }
      const ready = () => { loaded.current = true; setStatus('ready') }
      const restored = () => { setStatus('loading'); map.once('idle', ready) }
      map.on('webglcontextlost', lost)
      map.on('webglcontextrestored', restored)
      stopMapEvents.current = () => {
        map.off('webglcontextlost', lost)
        map.off('webglcontextrestored', restored)
        map.off('idle', ready)
      }
    } else stopMapEvents.current = undefined
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
    <div className={cn('relative', className)} data-testid="map-wrapper">
      <Map
        key={attempt}
        ref={setMapRef}
        {...viewState}
        onMove={handleMove}
        onClick={onClick}
        mapStyle={mapStyle ?? DARK_STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        onLoad={() => { loaded.current = true; setStatus('ready') }}
        onError={() => { if (!loaded.current) setStatus('error') }}
      >
        <NavigationControl position="bottom-right" />
        {children}
      </Map>
      {status !== 'ready' && (
        <div className="safe-page pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <OverlayPanel className="pointer-events-auto max-w-sm text-center" role={status === 'error' ? 'alert' : 'status'} data-testid="map-load-status">
            <p className="text-sm">{t(status === 'error' ? 'build.mapUnavailable' : 'build.mapLoading')}</p>
            {status === 'error' && <Button variant="outline" className="mt-3" onClick={retry}>{t('common.retry')}</Button>}
          </OverlayPanel>
        </div>
      )}
    </div>
  )
}
