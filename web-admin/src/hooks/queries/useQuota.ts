import { useQuery } from '@tanstack/react-query'
import { workspacesApi } from '../../lib/api/workspaces'
import { useWorkspaceContext } from '../../stores/workspaceContext'

export function useQuota() {
  const { active } = useWorkspaceContext()

  return useQuery({
    queryKey: ['quota', active.type === 'org' ? active.orgId : 'personal'],
    queryFn: () =>
      active.type === 'org'
        ? workspacesApi.getOrgQuota(active.orgId)
        : workspacesApi.getPersonalQuota(),
  })
}
