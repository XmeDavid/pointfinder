import apiClient from './client'
import type { AdminUser, AdminUserDetail, AdminOrg, AdminOrgDetail } from '../../types/admin'
import type { Game } from '../../types'

export const adminApi = {
  listUsers: (params?: { search?: string; page?: number; size?: number }) =>
    apiClient.get<{ content: AdminUser[]; totalElements: number }>('/api/admin/users', { params }).then(r => r.data),

  getUserDetail: (userId: string) =>
    apiClient.get<AdminUserDetail>(`/api/admin/users/${userId}`).then(r => r.data),

  getUserGames: (userId: string) =>
    apiClient.get<Game[]>(`/api/admin/users/${userId}/games`).then(r => r.data),

  listOrgs: (params?: { search?: string; page?: number; size?: number }) =>
    apiClient.get<{ content: AdminOrg[]; totalElements: number }>('/api/admin/orgs', { params }).then(r => r.data),

  getOrgDetail: (orgId: string) =>
    apiClient.get<AdminOrgDetail>(`/api/admin/orgs/${orgId}`).then(r => r.data),

  getOrgGames: (orgId: string) =>
    apiClient.get<Game[]>(`/api/admin/orgs/${orgId}/games`).then(r => r.data),

  overrideUserSubscription: (userId: string, data: Record<string, unknown>) =>
    apiClient.patch(`/api/admin/users/${userId}/subscription`, data),

  overrideOrgSubscription: (orgId: string, data: Record<string, unknown>) =>
    apiClient.patch(`/api/admin/orgs/${orgId}/subscription`, data),
}
