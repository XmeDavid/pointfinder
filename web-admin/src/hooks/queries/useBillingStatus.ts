import { useQuery } from '@tanstack/react-query'
import { billingApi } from '../../lib/api/billing'
import { useAuthStore } from '../../lib/auth/store'

export function useBillingStatus() {
  const { isAuthenticated, accessToken } = useAuthStore()
  return useQuery({
    queryKey: ['billing-status'],
    queryFn: () => billingApi.getStatus(),
    enabled: isAuthenticated && !!accessToken,
    retry: false,
  })
}
