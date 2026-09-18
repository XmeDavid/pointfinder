import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import { kv } from '@/platform'
import { isNative } from '@/platform/runtime'

interface Camera { longitude: number; latitude: number; zoom: number; bearing: number; pitch: number }
const writes = new Map<string, Promise<void>>()
const prefix = 'map-camera:'

function valid(camera: Camera): boolean {
  return [camera.longitude, camera.latitude, camera.zoom, camera.bearing, camera.pitch].every(Number.isFinite)
    && Math.abs(camera.longitude) <= 180 && Math.abs(camera.latitude) <= 90 && camera.zoom >= 0 && camera.zoom <= 24 && camera.pitch >= 0 && camera.pitch <= 85
}

/** Recover a phone's map camera, scoped by account/player and game. */
export function useMapCamera(map: RefObject<MapRef | null>, key?: string) {
  const enabled = isNative() && !!key
  const [restored, setRestored] = useState<{ key: string; hasCamera: boolean } | null>(null)
  const interacted = useRef(false)
  const lastCamera = useRef<Camera | null>(null)
  const ready = !enabled || restored?.key === key
  const hasCamera = enabled && restored?.key === key && restored.hasCamera

  useEffect(() => {
    if (!enabled || !key) return
    let active = true
    interacted.current = false
    lastCamera.current = null
    void kv.get(prefix + key).then(raw => {
      let camera: Camera | null = null
      try { camera = raw ? JSON.parse(raw) : null } catch { /* An invalid record uses the normal map framing. */ }
      if (!active) return
      const useCamera = !!camera && valid(camera)
      if (useCamera && !interacted.current) {
        lastCamera.current = camera
        map.current?.jumpTo({ center: [camera!.longitude, camera!.latitude], zoom: camera!.zoom, bearing: camera!.bearing, pitch: camera!.pitch })
      }
      setRestored({ key, hasCamera: useCamera || interacted.current })
    }).catch(() => { if (active) setRestored({ key, hasCamera: interacted.current }) })
    return () => { active = false }
  }, [enabled, key, map])

  const onMoveStart = useCallback((event: { originalEvent?: unknown }) => {
    if (event.originalEvent) interacted.current = true
  }, [])
  const onMoveEnd = useCallback(() => {
    if (!enabled || !ready || !key || !map.current) return
    const instance = map.current
    const center = instance.getCenter()
    const camera: Camera = { longitude: center.lng, latitude: center.lat, zoom: instance.getZoom(), bearing: instance.getBearing(), pitch: instance.getPitch() }
    if (!valid(camera)) return
    lastCamera.current = camera
    const prior = writes.get(key) ?? Promise.resolve()
    const next = prior.then(() => kv.set(prefix + key, JSON.stringify(camera))).catch(() => {}).finally(() => {
      if (writes.get(key) === next) writes.delete(key)
    })
    writes.set(key, next)
  }, [enabled, ready, key, map])
  const onLoad = useCallback(() => {
    const camera = lastCamera.current
    if (camera) map.current?.jumpTo({ center: [camera.longitude, camera.latitude], zoom: camera.zoom, bearing: camera.bearing, pitch: camera.pitch })
  }, [map])
  return { ready, hasCamera, onMoveStart, onMoveEnd, onLoad }
}
