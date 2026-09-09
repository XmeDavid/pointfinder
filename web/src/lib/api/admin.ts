import apiClient from './client'
import type {
  AdminUser,
  AdminUserDetail,
  AdminOrg,
  AdminOrgDetail,
  CreateClubRequest,
  CreateClubResult,
  IssueInvoiceRequest,
  UpdateClubRequest,
} from '@/types/admin'
import type { Organization } from '@/types/organization'
import type { OrgInvoice } from '@/types/billing'
import type { Game } from '../../types'

export const adminApi = {
  listUsers: (params?: { search?: string; page?: number; size?: number }) =>
    apiClient.get<{ content: AdminUser[]; totalElements: number }>('/admin/users', { params }).then(r => r.data),

  getUserDetail: (userId: string) =>
    apiClient.get<AdminUserDetail>(`/admin/users/${userId}`).then(r => r.data),

  getUserGames: (userId: string) =>
    apiClient.get<Game[]>(`/admin/users/${userId}/games`).then(r => r.data),

  listOrgs: (params?: { search?: string; page?: number; size?: number }) =>
    apiClient.get<{ content: AdminOrg[]; totalElements: number }>('/admin/orgs', { params }).then(r => r.data),

  getOrgDetail: (orgId: string) =>
    apiClient.get<AdminOrgDetail>(`/admin/orgs/${orgId}`).then(r => r.data),

  getOrgGames: (orgId: string) =>
    apiClient.get<Game[]>(`/admin/orgs/${orgId}/games`).then(r => r.data),

  overrideUserSubscription: (userId: string, data: Record<string, unknown>) =>
    apiClient.patch(`/admin/users/${userId}/subscription`, data),

  // Sales-led clubs. There is no org subscription to override: a club is
  // created, its limits and term are set here, and it is invoiced.
  createClub: (data: CreateClubRequest) =>
    apiClient.post<CreateClubResult>('/admin/orgs', data).then(r => r.data),

  updateClub: (orgId: string, data: UpdateClubRequest) =>
    apiClient.patch<Organization>(`/admin/orgs/${orgId}`, data).then(r => r.data),

  transferOrgOwnership: (orgId: string, userId: string) =>
    apiClient.post<Organization>(`/admin/orgs/${orgId}/transfer-ownership`, { userId }).then(r => r.data),

  issueOrgInvoice: (orgId: string, data: IssueInvoiceRequest) =>
    apiClient.post<OrgInvoice>(`/admin/orgs/${orgId}/invoices`, data).then(r => r.data),

  listOrgInvoices: (orgId: string) =>
    apiClient.get<OrgInvoice[]>(`/admin/orgs/${orgId}/invoices`).then(r => r.data),
}
