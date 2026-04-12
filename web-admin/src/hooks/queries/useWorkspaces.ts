import { useQuery } from '@tanstack/react-query'
import { workspacesApi } from '../../lib/api/workspaces'

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list(),
  })
}
