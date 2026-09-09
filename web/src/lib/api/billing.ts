import apiClient from './client'
import type { CheckoutResponse, UserSubscription, InvoiceListResponse } from '../../types/billing'
import type { CheckoutCycle } from '../pricing'

/**
 * Personal plans only. Clubs are sales-led: there is no org checkout, no org
 * billing portal, and no org scope on these endpoints. A club's invoices come
 * from `/orgs/{id}/invoices` instead — see `organizationsApi.listInvoices`.
 */
export const billingApi = {
  createCheckout: (plan: string, cycle: CheckoutCycle) =>
    apiClient.post<CheckoutResponse>('/billing/checkout', { plan, cycle }).then(r => r.data),

  createPortal: () =>
    apiClient.post<{ url: string }>('/billing/portal').then(r => r.data),

  getStatus: () =>
    apiClient.get<UserSubscription>('/billing/status').then(r => r.data),

  getInvoices: (params: { limit?: number; startingAfter?: string }) =>
    apiClient.get<InvoiceListResponse>('/billing/invoices', { params }).then(r => r.data),
}
