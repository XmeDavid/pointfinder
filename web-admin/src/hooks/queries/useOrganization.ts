import { useQuery } from '@tanstack/react-query'
import { organizationsApi } from '../../lib/api/organizations'

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => organizationsApi.getMembers(orgId!),
    enabled: !!orgId,
  })
}
