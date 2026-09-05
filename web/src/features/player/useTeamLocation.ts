import { useEffect, useRef } from 'react'
import { DEFAULT_SEND_POLICY, decideSend, type Fix } from '@pointfinder/game-core'
import { useServices } from '@/app/player/services'
import { useLocationStore, type LocationStatus } from '@/app/player/locationStore'

export type { LocationStatus }

/**
 * Reports the team's position to the operators from the shared location store.
 * The watch itself belongs to the player runtime; this hook only decides which
 * fixes are worth sending (accuracy, movement, heartbeat), so the operator map
 * gets one honest dot per team instead of the scatter the old apps produced.
 */
export function useTeamLocation(gameId: string | null, enabled: boolean) {
  const { client } = useServices()
  const fix = useLocationStore((s) => s.fix)
  const heading = useLocationStore((s) => s.heading)
  const status = useLocationStore((s) => s.status)
  const lastSent = useRef<{ fix: Fix; at: number } | null>(null)

  useEffect(() => { lastSent.current = null }, [gameId, enabled])

  useEffect(() => {
    if (!gameId || !enabled || !fix) return
    const now = Date.now()
    const decision = decideSend(fix, lastSent.current?.fix ?? null, lastSent.current?.at ?? null, now, DEFAULT_SEND_POLICY)
    if (!decision.send) return
    lastSent.current = { fix, at: now }
    client.api.player
      .updateLocation(gameId, { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, capturedAt: new Date(fix.capturedAt).toISOString() })
      .catch(() => { lastSent.current = null })
  }, [client, gameId, enabled, fix])

  return { fix, heading, status }
}
