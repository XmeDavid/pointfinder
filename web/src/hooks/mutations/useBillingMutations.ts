import { openExternal } from '@/platform/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { billingApi } from '../../lib/api/billing'
import type { CheckoutCycle } from '../../lib/pricing'

function invalidateBillingCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['workspaces'] })
  qc.invalidateQueries({ queryKey: ['quota'] })
  qc.invalidateQueries({ queryKey: ['billing-status'] })
  qc.invalidateQueries({ queryKey: ['invoices'] })
}

export function useCreateCheckout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ plan, cycle }: { plan: string; cycle: CheckoutCycle }) =>
      billingApi.createCheckout(plan, cycle),
    onSuccess: (data) => {
      invalidateBillingCaches(qc)
      return openExternal(data.url)
    },
  })
}

export function useCreatePortal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => billingApi.createPortal(),
    onSuccess: (data) => {
      invalidateBillingCaches(qc)
      return openExternal(data.url)
    },
  })
}
