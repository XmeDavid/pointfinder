import { useQuery } from '@tanstack/react-query'
import { workspacesApi } from '../../lib/api/workspaces'
import { useWorkspaceContext } from '../../stores/workspaceContext'
import { useAuthStore } from '../../lib/auth/store'

export function useQuota() {
  const { active } = useWorkspaceContext()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const accessToken = useAuthStore((s) => s.accessToken)

  return useQuery({
    queryKey: ['quota', active.type === 'org' ? active.orgId : 'personal'],
    queryFn: () =>
      active.type === 'org'
        ? workspacesApi.getOrgQuota(active.orgId)
        : workspacesApi.getPersonalQuota(),
    enabled: isAuthenticated && !!accessToken,
    retry: false,
  })
}
