import { useQuery } from '@tanstack/react-query'
import { workspacesApi } from '../../lib/api/workspaces'
import { useAuthStore } from '../../lib/auth/store'

export function useWorkspaces() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const accessToken = useAuthStore((s) => s.accessToken)

  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list(),
    enabled: isAuthenticated && !!accessToken,
    retry: false,
  })
}
