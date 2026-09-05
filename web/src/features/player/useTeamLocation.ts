import { useEffect, useRef, useState } from 'react'
import { watchLocation, type LocationPosition } from '@/platform/geolocation'
import { DEFAULT_SEND_POLICY, decideSend, type Fix } from '@pointfinder/game-core'
import { useServices } from '@/app/player/services'

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
    if (!gameId || !enabled) return
    let stop: (() => void) | undefined
    let cancelled = false

    const onPosition = (p: LocationPosition | null, error?: string) => {
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

    lastSent.current = null
    void watchLocation(onPosition, (state) => { if (!cancelled) setStatus(state) }).then((off) => {
      if (cancelled) off()
      else stop = off
    }).catch(() => { if (!cancelled) setStatus('unavailable') })

    return () => {
      cancelled = true
      stop?.()
    }
  }, [client, gameId, enabled])

  return { fix, heading, status }
}
