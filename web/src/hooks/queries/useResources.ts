import { useQuery } from '@tanstack/react-query'
import { resourcesApi } from '../../lib/api/resources'

export function useOrgResources(orgId: string | undefined, params?: { folderId?: string; search?: string }) {
  return useQuery({
    queryKey: ['org-resources', orgId, params],
    queryFn: () => resourcesApi.listOrgResources(orgId!, params),
    enabled: !!orgId,
  })
}

export function useGameResources(gameId: string | undefined, params?: { folderId?: string; search?: string }) {
  return useQuery({
    queryKey: ['game-resources', gameId, params],
    queryFn: () => resourcesApi.listGameResources(gameId!, params),
    enabled: !!gameId,
  })
}

export function useOrgFolders(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-folders', orgId],
    queryFn: () => resourcesApi.listOrgFolders(orgId!),
    enabled: !!orgId,
  })
}

export function useGameFolders(gameId: string | undefined) {
  return useQuery({
    queryKey: ['game-folders', gameId],
    queryFn: () => resourcesApi.listGameFolders(gameId!),
    enabled: !!gameId,
  })
}
