import { useEffect, useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { connectWebSocket, disconnectWebSocket } from '@/lib/api/websocket'
import { getValidAccessToken } from '@/lib/api/client'

/**
 * Main game WebSocket subscription hook.
 *
 * Connects to the game's STOMP topic on mount and routes incoming messages
 * to React Query cache — either as direct cache writes (high-frequency data)
 * or query invalidations (structural changes).
 *
 * This is a legitimate useEffect location: syncing with an external system.
 *
 * @returns connectionError - null when healthy, error string when WS is degraded
 */
export function useGameStream(gameId: string | undefined): string | null {
  const queryClient = useQueryClient()
  const [connectionError, setConnectionError] = useState<string | null>(null)
  // Guard against stale closure references during reconnect
  const gameIdRef = useRef(gameId)
  useEffect(() => {
    gameIdRef.current = gameId
  })

  const handleMessage = useCallback(
    (payload: { type: string; data: unknown }) => {
      const gid = gameIdRef.current
      if (!gid) return

      switch (payload.type) {
        case 'activity':
          // Prepend to activity feed cache
          queryClient.setQueryData(
            ['monitoring', 'activity', gid],
            (old: unknown[] | undefined) =>
              old ? [payload.data, ...old] : [payload.data]
          )
          // Also invalidate submissions and dashboard (aggregated views)
          queryClient.invalidateQueries({ queryKey: ['submissions', gid] })
          queryClient.invalidateQueries({
            queryKey: ['monitoring', 'dashboard', gid],
          })
          break

        case 'location':
          // Replace locations cache wholesale
          queryClient.setQueryData(
            ['monitoring', 'locations', gid],
            payload.data
          )
          break

        case 'leaderboard':
          // Replace leaderboard cache wholesale
          queryClient.setQueryData(
            ['monitoring', 'leaderboard', gid],
            payload.data
          )
          break

        case 'submission_status':
          // Submission review decision — invalidate submission list
          queryClient.invalidateQueries({ queryKey: ['submissions', gid] })
          queryClient.invalidateQueries({
            queryKey: ['monitoring', 'dashboard', gid],
          })
          break

        case 'game_status':
          // Game lifecycle change — invalidate game queries
          queryClient.invalidateQueries({ queryKey: ['game', gid] })
          queryClient.invalidateQueries({ queryKey: ['games'] })
          break

        case 'game_config':
          // Entity-level config change — invalidate by entity type if known
          {
            const entity = (payload.data as Record<string, unknown>)?.entity
            if (entity && typeof entity === 'string') {
              queryClient.invalidateQueries({ queryKey: [entity, gid] })
            } else {
              queryClient.invalidateQueries({ queryKey: ['game', gid] })
            }
          }
          break

        case 'notification':
          queryClient.invalidateQueries({
            queryKey: ['notifications', gid],
          })
          break

        case 'presence':
          // Operator presence — store in cache for health indicator
          queryClient.setQueryData(
            ['monitoring', 'presence', gid],
            payload.data
          )
          break

        default:
          // Unknown type — defensive invalidation of core monitoring queries
          queryClient.invalidateQueries({
            queryKey: ['monitoring', 'dashboard', gid],
          })
          break
      }
    },
    [queryClient]
  )

  const handleError = useCallback((message: string) => {
    setConnectionError(message)
  }, [])

  const handleReconnect = useCallback(() => {
    const gid = gameIdRef.current
    if (!gid) return
    // Clear error state — we're back online
    setConnectionError(null)
    // Invalidate all snapshot-superseded queries so React Query refetches
    queryClient.invalidateQueries({ queryKey: ['monitoring', 'activity', gid] })
    queryClient.invalidateQueries({
      queryKey: ['monitoring', 'locations', gid],
    })
    queryClient.invalidateQueries({
      queryKey: ['monitoring', 'leaderboard', gid],
    })
    queryClient.invalidateQueries({
      queryKey: ['monitoring', 'dashboard', gid],
    })
    queryClient.invalidateQueries({ queryKey: ['submissions', gid] })
    queryClient.invalidateQueries({ queryKey: ['game', gid] })
  }, [queryClient])

  const tokenProvider = useCallback(async (): Promise<string | null> => {
    // getValidAccessToken() already checks JWT expiry and refreshes
    // proactively when the token is within 60s of expiry. No need to
    // force-clear — that was causing unnecessary token rotations and
    // race conditions with concurrent HTTP refreshes.
    return getValidAccessToken()
  }, [])

  useEffect(() => {
    if (!gameId) return

    connectWebSocket(
      gameId,
      handleMessage,
      handleError,
      handleReconnect,
      tokenProvider
    )

    return () => {
      // disconnectWebSocket deactivates the global singleton; but the client
      // returned by connectWebSocket is the same reference, so this is safe.
      disconnectWebSocket()
    }
  }, [gameId, handleMessage, handleError, handleReconnect, tokenProvider])

  return connectionError
}
