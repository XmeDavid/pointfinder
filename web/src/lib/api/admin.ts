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
import type { GamePublicationResponse, PublicationReportResponse } from '@pointfinder/api'

/** Shared by the Reports tab and its count in the admin panel. */
export const ADMIN_REPORTS_QUERY_KEY = ['admin', 'publication-reports'] as const

export const adminApi = {
  // PF-07/OW-06: curation of Explore listings. Removal is the ordinary unpublish, which admins may use.
  listPublications: () =>
    apiClient.get<GamePublicationResponse[]>('/admin/publications').then(r => r.data),

  setFeatured: (gameId: string, featured: boolean) =>
    apiClient.post<GamePublicationResponse>(`/admin/publications/${gameId}/${featured ? 'feature' : 'unfeature'}`).then(r => r.data),

  // Owner decision 2026-09-24: an admin removal holds the listing until an admin allows it again.
  removeFromExplore: (gameId: string) =>
    apiClient.post<GamePublicationResponse>(`/admin/publications/${gameId}/remove`).then(r => r.data),

  releaseListing: (gameId: string) =>
    apiClient.post<GamePublicationResponse>(`/admin/publications/${gameId}/release`).then(r => r.data),

  blockUser: (userId: string, reason: string) =>
    apiClient.post<AdminUserDetail>(`/admin/users/${userId}/block`, { reason }).then(r => r.data),

  unblockUser: (userId: string) =>
    apiClient.post<AdminUserDetail>(`/admin/users/${userId}/unblock`).then(r => r.data),

  // OW-06: reports from signed-in accounts about listed games, oldest first.
  listReports: () =>
    apiClient.get<PublicationReportResponse[]>('/admin/publications/reports').then(r => r.data),

  dismissReports: (gameId: string) =>
    apiClient.post(`/admin/publications/${gameId}/reports/dismiss`).then(() => undefined),

  removeReported: (gameId: string) =>
    apiClient.post<GamePublicationResponse>(`/admin/publications/${gameId}/reports/remove`).then(r => r.data),

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
