import { useInfiniteQuery } from '@tanstack/react-query'
import { billingApi } from '@/lib/api/billing'
import { useAuthStore } from '@/lib/auth/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'

export function useInvoices() {
  const { isAuthenticated, accessToken } = useAuthStore()
  const { active } = useWorkspaceContext()
  const orgId = active.type === 'org' ? active.orgId : undefined

  return useInfiniteQuery({
    queryKey: ['invoices', orgId],
    queryFn: ({ pageParam }) =>
      billingApi.getInvoices({
        limit: 10,
        startingAfter: pageParam ?? undefined,
        orgId,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.invoices.length === 0) return undefined
      return lastPage.invoices[lastPage.invoices.length - 1].id
    },
    enabled: isAuthenticated && !!accessToken,
  })
}
