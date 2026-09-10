import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, type PlayerResource } from '@pointfinder/api'
import { useAuth, useServices } from '@/app/player/services'
import { gameCache } from '@/platform'

/** Presigned file links last about an hour; refresh the list before opening one older than this. */
export const DOWNLOAD_URL_MAX_AGE_MS = 45 * 60_000

/**
 * The files and documents the team may see, cached like the game data so the
 * list (and every document's content) survives a dead network. File links
 * still need a connection, which the screen explains when `fromCache` is set.
 */
export function usePlayerDocuments() {
  const auth = useAuth()
  const { client } = useServices()
  const gameId = auth.kind === 'player' ? auth.gameId : null
  const cacheKey = auth.kind === 'player' ? `files:${auth.playerId}:${auth.gameId}` : ''
  const [fromCache, setFromCache] = useState(false)

  const query = useQuery({
    queryKey: ['documents', gameId],
    queryFn: async (): Promise<PlayerResource[]> => {
      try {
        const value = await client.api.player.files(gameId!)
        await gameCache.save(cacheKey, 0, value).catch(() => {})
        setFromCache(false)
        return value
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          const hit = await gameCache.load<PlayerResource[]>(cacheKey).catch(() => null)
          if (hit) {
            setFromCache(true)
            return hit.snapshot
          }
        }
        throw err
      }
    },
    enabled: gameId !== null,
    staleTime: 5 * 60_000,
  })

  const { refetch, dataUpdatedAt } = query
  /** A download URL that is still valid: the cached one, or a fresh list's when the cached one may have expired. */
  const freshDownloadUrl = useCallback(async (resource: PlayerResource): Promise<string | null> => {
    if (Date.now() - dataUpdatedAt < DOWNLOAD_URL_MAX_AGE_MS) return resource.downloadUrl
    const result = await refetch()
    return result.data?.find((r) => r.id === resource.id)?.downloadUrl ?? null
  }, [dataUpdatedAt, refetch])

  return { ...query, fromCache, freshDownloadUrl }
}
