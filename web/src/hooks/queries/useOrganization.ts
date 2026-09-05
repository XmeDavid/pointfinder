import { useQuery } from '@tanstack/react-query'
import { organizationsApi } from '../../lib/api/organizations'

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => organizationsApi.getMembers(orgId!),
    enabled: !!orgId,
  })
}

export function useOrgInvites(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-invites', orgId],
    queryFn: () => organizationsApi.listInvites(orgId!),
    enabled: !!orgId,
  })
}

export function useMyOrgInvites() {
  return useQuery({
    queryKey: ['my-org-invites'],
    queryFn: () => organizationsApi.getMyOrgInvites(),
  })
}
