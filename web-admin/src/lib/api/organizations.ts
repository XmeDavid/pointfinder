import apiClient from './client'
import type { Organization, OrgMember } from '../../types/organization'

export const organizationsApi = {
  create: (name: string) =>
    apiClient.post<Organization>('/api/orgs', { name }).then(r => r.data),

  getById: (orgId: string) =>
    apiClient.get<Organization>(`/api/orgs/${orgId}`).then(r => r.data),

  update: (orgId: string, data: { name?: string }) =>
    apiClient.patch<Organization>(`/api/orgs/${orgId}`, data).then(r => r.data),

  delete: (orgId: string) =>
    apiClient.delete(`/api/orgs/${orgId}`),

  getMembers: (orgId: string) =>
    apiClient.get<OrgMember[]>(`/api/orgs/${orgId}/members`).then(r => r.data),

  inviteMember: (orgId: string, email: string) =>
    apiClient.post<OrgMember>(`/api/orgs/${orgId}/members/invite`, { email }).then(r => r.data),

  removeMember: (orgId: string, userId: string) =>
    apiClient.delete(`/api/orgs/${orgId}/members/${userId}`),

  updatePermissions: (orgId: string, userId: string, permissions: number) =>
    apiClient.patch<OrgMember>(`/api/orgs/${orgId}/members/${userId}/permissions`, { permissions }).then(r => r.data),
}
