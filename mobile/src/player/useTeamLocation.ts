import { useEffect, useRef, useState } from 'react'
import { checkPermissions, clearWatch, requestPermissions, watchPosition, type Position } from '@tauri-apps/plugin-geolocation'
import { DEFAULT_SEND_POLICY, decideSend, type Fix } from '@pointfinder/game-core'
import { useServices } from '../app/services'
import { isNative } from '../platform'

export type LocationStatus = 'idle' | 'requesting' | 'watching' | 'denied' | 'unavailable'

/**
 * Follows the phone while a game is live and reports the team's position to the operators.
 * Only fixes worth sending go out (accuracy, movement, heartbeat), so the operator map gets
 * one honest dot per team instead of the scatter the old apps produced.
 */
export function useTeamLocation(gameId: string | null, enabled: boolean) {
  const { client } = useServices()
  const [fix, setFix] = useState<Fix | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [status, setStatus] = useState<LocationStatus>('idle')
  const lastSent = useRef<{ fix: Fix; at: number } | null>(null)

  useEffect(() => {
    if (!gameId || !enabled || !isNative()) return
    let watchId: number | null = null
    let cancelled = false

    const onPosition = (p: Position | null, error?: string) => {
      if (cancelled) return
      if (!p) {
        if (error) setStatus('unavailable')
        return
      }
      const f: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, capturedAt: p.timestamp }
      setFix(f)
      setHeading(p.coords.heading)
      const now = Date.now()
      const decision = decideSend(f, lastSent.current?.fix ?? null, lastSent.current?.at ?? null, now, DEFAULT_SEND_POLICY)
      if (!decision.send) return
      lastSent.current = { fix: f, at: now }
      client.api.player
        .updateLocation(gameId, { lat: f.lat, lng: f.lng, accuracy: f.accuracy, capturedAt: new Date(f.capturedAt).toISOString() })
        .catch(() => { lastSent.current = null })
    }

    ;(async () => {
      setStatus('requesting')
      let perms = await checkPermissions().catch(() => null)
      if (perms && perms.location !== 'granted') perms = await requestPermissions(['location']).catch(() => null)
      if (cancelled) return
      if (!perms || perms.location !== 'granted') return setStatus('denied')
      watchId = await watchPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 }, onPosition).catch(() => null)
      if (cancelled && watchId !== null) void clearWatch(watchId)
      else setStatus(watchId === null ? 'unavailable' : 'watching')
    })()

    return () => {
      cancelled = true
      if (watchId !== null) void clearWatch(watchId)
    }
  }, [client, gameId, enabled])

  return { fix, heading, status }
}
