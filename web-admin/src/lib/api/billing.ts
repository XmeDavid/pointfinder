import apiClient from './client'
import type { CheckoutResponse, UserSubscription } from '../../types/billing'

export const billingApi = {
  createCheckout: (plan: string, cycle: string, orgId?: string) =>
    apiClient.post<CheckoutResponse>('/billing/checkout', { plan, cycle, orgId }).then(r => r.data),

  createOrgCheckout: (orgName: string, plan: string, cycle: string) =>
    apiClient.post<CheckoutResponse>('/billing/org-checkout', { orgName, plan, cycle }).then(r => r.data),

  createPortal: () =>
    apiClient.post<{ url: string }>('/billing/portal').then(r => r.data),

  createOrgPortal: (orgId: string) =>
    apiClient.post<{ url: string }>('/billing/org-portal', { orgId }).then(r => r.data),

  getStatus: () =>
    apiClient.get<UserSubscription>('/billing/status').then(r => r.data),
}
