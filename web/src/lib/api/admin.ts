import apiClient from './client'
import type { AdminUser, AdminUserDetail, AdminOrg, AdminOrgDetail } from '../../types/admin'
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

  overrideOrgSubscription: (orgId: string, data: Record<string, unknown>) =>
    apiClient.patch(`/admin/orgs/${orgId}/subscription`, data),
}
