import { useMutation, useQueryClient } from '@tanstack/react-query'
import { billingApi } from '../../lib/api/billing'

function invalidateBillingCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['workspaces'] })
  qc.invalidateQueries({ queryKey: ['quota'] })
  qc.invalidateQueries({ queryKey: ['billing-status'] })
  qc.invalidateQueries({ queryKey: ['invoices'] })
}

export function useCreateCheckout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ plan, cycle, orgId }: { plan: string; cycle: string; orgId?: string }) =>
      billingApi.createCheckout(plan, cycle, orgId),
    onSuccess: (data) => {
      invalidateBillingCaches(qc)
      window.location.href = data.url
    },
  })
}

export function useCreatePortal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => billingApi.createPortal(),
    onSuccess: (data) => {
      invalidateBillingCaches(qc)
      window.location.href = data.url
    },
  })
}

export function useCreateOrgPortal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orgId: string) => billingApi.createOrgPortal(orgId),
    onSuccess: (data) => {
      invalidateBillingCaches(qc)
      window.location.href = data.url
    },
  })
}
