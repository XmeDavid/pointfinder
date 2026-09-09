import { useQuery } from '@tanstack/react-query'
import { organizationsApi } from '../../lib/api/organizations'

export function useOrg(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org', orgId],
    queryFn: () => organizationsApi.getById(orgId!),
    enabled: !!orgId,
    retry: false,
  })
}

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

/** The club's own invoice history. Only a member with MANAGE_BILLING may read it. */
export function useOrgInvoices(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['org-invoices', orgId],
    queryFn: () => organizationsApi.listInvoices(orgId!),
    enabled: !!orgId && enabled,
    retry: false,
  })
}

export function useMyOrgInvites() {
  return useQuery({
    queryKey: ['my-org-invites'],
    queryFn: () => organizationsApi.getMyOrgInvites(),
  })
}
