import { useMutation, useQueryClient } from '@tanstack/react-query'
import { organizationsApi } from '../../lib/api/organizations'

export function useCreateOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => organizationsApi.create(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}

export function useInviteOrgMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => organizationsApi.inviteMember(orgId, email),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}

export function useRemoveOrgMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => organizationsApi.removeMember(orgId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}

export function useUpdateOrgPermissions(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: number }) =>
      organizationsApi.updatePermissions(orgId, userId, permissions),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] })
    },
  })
}

export function useDeleteOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orgId: string) => organizationsApi.delete(orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}
