import { useMutation } from '@tanstack/react-query'
import { billingApi } from '../../lib/api/billing'

export function useCreateCheckout() {
  return useMutation({
    mutationFn: ({ plan, cycle, orgId }: { plan: string; cycle: string; orgId?: string }) =>
      billingApi.createCheckout(plan, cycle, orgId),
    onSuccess: (data) => {
      window.location.href = data.url
    },
  })
}

export function useCreatePortal() {
  return useMutation({
    mutationFn: () => billingApi.createPortal(),
    onSuccess: (data) => {
      window.location.href = data.url
    },
  })
}
