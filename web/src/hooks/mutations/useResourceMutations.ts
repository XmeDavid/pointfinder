import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resourcesApi } from '../../lib/api/resources'

export function useCreateOrgResource(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) => resourcesApi.createOrgResource(orgId, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-resources', orgId] })
      qc.invalidateQueries({ queryKey: ['quota'] })
    },
  })
}

export function useCreateGameResource(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) => resourcesApi.createGameResource(gameId, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game-resources', gameId] })
      qc.invalidateQueries({ queryKey: ['quota'] })
    },
  })
}

export function useUpdateResource(scope: { orgId?: string; gameId?: string }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof resourcesApi.update>[1] }) =>
      resourcesApi.update(id, data),
    onSuccess: () => {
      if (scope.orgId) qc.invalidateQueries({ queryKey: ['org-resources', scope.orgId] })
      if (scope.gameId) qc.invalidateQueries({ queryKey: ['game-resources', scope.gameId] })
    },
  })
}

export function useDeleteResource(scope: { orgId?: string; gameId?: string }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (resourceId: string) => resourcesApi.delete(resourceId),
    onSuccess: () => {
      if (scope.orgId) qc.invalidateQueries({ queryKey: ['org-resources', scope.orgId] })
      if (scope.gameId) qc.invalidateQueries({ queryKey: ['game-resources', scope.gameId] })
      qc.invalidateQueries({ queryKey: ['quota'] })
    },
  })
}

export function useCreateFolder(scope: { orgId?: string; gameId?: string }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; parentId?: string }) => {
      if (scope.orgId) return resourcesApi.createOrgFolder(scope.orgId, data)
      if (scope.gameId) return resourcesApi.createGameFolder(scope.gameId, data)
      throw new Error('No scope provided')
    },
    onSuccess: () => {
      if (scope.orgId) qc.invalidateQueries({ queryKey: ['org-folders', scope.orgId] })
      if (scope.gameId) qc.invalidateQueries({ queryKey: ['game-folders', scope.gameId] })
    },
  })
}

export function useDeleteFolder(scope: { orgId?: string; gameId?: string }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (folderId: string) => resourcesApi.deleteFolder(folderId),
    onSuccess: () => {
      if (scope.orgId) qc.invalidateQueries({ queryKey: ['org-folders', scope.orgId] })
      if (scope.gameId) qc.invalidateQueries({ queryKey: ['game-folders', scope.gameId] })
    },
  })
}
