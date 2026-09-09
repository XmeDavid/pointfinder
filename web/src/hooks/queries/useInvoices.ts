import { useInfiniteQuery } from '@tanstack/react-query'
import { billingApi } from '@/lib/api/billing'
import { useAuthStore } from '@/lib/auth/store'

/**
 * The caller's own Stripe invoices. Personal only: a club is invoiced by us and
 * reads its invoices from `useOrgInvoices` instead.
 */
export function useInvoices() {
  const { isAuthenticated, accessToken } = useAuthStore()

  return useInfiniteQuery({
    queryKey: ['invoices'],
    queryFn: ({ pageParam }) =>
      billingApi.getInvoices({
        limit: 10,
        startingAfter: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.invoices.length === 0) return undefined
      return lastPage.invoices[lastPage.invoices.length - 1].id
    },
    enabled: isAuthenticated && !!accessToken,
  })
}
