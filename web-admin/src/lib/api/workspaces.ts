import apiClient from './client'
import type { Workspace } from '../../types/organization'
import type { QuotaResponse } from '../../types/billing'

export const workspacesApi = {
  list: () =>
    apiClient.get<Workspace>('/workspaces').then(r => r.data),

  getPersonalQuota: () =>
    apiClient.get<QuotaResponse>('/quota/personal').then(r => r.data),

  getOrgQuota: (orgId: string) =>
    apiClient.get<QuotaResponse>(`/quota/org/${orgId}`).then(r => r.data),
}
