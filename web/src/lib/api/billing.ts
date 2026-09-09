import apiClient from './client'
import type { CheckoutResponse, UserSubscription, InvoiceListResponse } from '../../types/billing'
import type { CheckoutCycle } from '../pricing'

export const billingApi = {
  // Personal plans only. Clubs are sales-led: there is no self-serve org checkout.
  createCheckout: (plan: string, cycle: CheckoutCycle) =>
    apiClient.post<CheckoutResponse>('/billing/checkout', { plan, cycle }).then(r => r.data),

  createPortal: () =>
    apiClient.post<{ url: string }>('/billing/portal').then(r => r.data),

  createOrgPortal: (orgId: string) =>
    apiClient.post<{ url: string }>('/billing/org-portal', { orgId }).then(r => r.data),

  getStatus: () =>
    apiClient.get<UserSubscription>('/billing/status').then(r => r.data),

  getInvoices: (params: { limit?: number; startingAfter?: string; orgId?: string }) =>
    apiClient.get<InvoiceListResponse>('/billing/invoices', { params }).then(r => r.data),
}
