import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { workspacesApi } from '../../lib/api/workspaces'
import { useAuthStore } from '../../lib/auth/store'
import { useWorkspaceContext } from '../../stores/workspaceContext'

export function useWorkspaces() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const accessToken = useAuthStore((s) => s.accessToken)
  const reconcile = useWorkspaceContext((s) => s.reconcile)

  const query = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list(),
    enabled: isAuthenticated && !!accessToken,
    retry: false,
  })

  // The active workspace is persisted per device, so it can name an org this
  // account no longer belongs to. The server's list is the authority.
  const workspaces = query.data
  useEffect(() => {
    if (workspaces) reconcile(workspaces)
  }, [workspaces, reconcile])

  return query
}
