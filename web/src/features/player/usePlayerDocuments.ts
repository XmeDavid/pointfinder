import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, type PlayerResource } from '@pointfinder/api'
import { useAuth, useServices } from '@/app/player/services'
import { gameCache } from '@/platform'

/** Presigned file links last about an hour; refresh the list before opening one older than this. */
export const DOWNLOAD_URL_MAX_AGE_MS = 45 * 60_000

export interface PlayerDocuments {
  resources: PlayerResource[]
  /** True when the network was down and this is the last copy saved on the device. */
  fromCache: boolean
  /** When the download URLs in `resources` were minted (the network fetch, not the cache read). */
  fetchedAt: number
}

/**
 * The files and documents the team may see, cached like the game data so the
 * list (and every document's content) survives a dead network. File links
 * still need a connection, which the screen explains when `fromCache` is set.
 * Both flags live in the query data, so they survive a remount served from
 * React Query's memory rather than from `queryFn`.
 */
export function usePlayerDocuments() {
  const auth = useAuth()
  const { client } = useServices()
  const gameId = auth.kind === 'player' ? auth.gameId : null
  const cacheKey = auth.kind === 'player' ? `files:${auth.playerId}:${auth.gameId}` : ''

  const query = useQuery({
    queryKey: ['documents', gameId],
    queryFn: async (): Promise<PlayerDocuments> => {
      try {
        const resources = await client.api.player.files(gameId!)
        await gameCache.save(cacheKey, 0, resources).catch(() => {})
        return { resources, fromCache: false, fetchedAt: Date.now() }
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          const hit = await gameCache.load<PlayerResource[]>(cacheKey).catch(() => null)
          if (hit) return { resources: hit.snapshot, fromCache: true, fetchedAt: Date.parse(hit.fetchedAt) || 0 }
        }
        throw err
      }
    },
    enabled: gameId !== null,
    staleTime: 5 * 60_000,
    // Reopening Documents picks up newly shared game resources immediately.
    refetchOnMount: 'always',
  })

  const { refetch, data } = query
  const linkStillFresh = useCallback(
    () => data !== undefined && !data.fromCache && Date.now() - data.fetchedAt < DOWNLOAD_URL_MAX_AGE_MS,
    [data],
  )
  /** A download URL that is still valid: the current one, or a fresh list's when the current one may have expired. */
  const freshDownloadUrl = useCallback(async (resource: PlayerResource): Promise<string | null> => {
    if (linkStillFresh()) return resource.downloadUrl
    const result = await refetch()
    if (!result.data || result.data.fromCache) return null
    return result.data.resources.find((r) => r.id === resource.id)?.downloadUrl ?? null
  }, [linkStillFresh, refetch])

  return { ...query, linkStillFresh, freshDownloadUrl }
}
