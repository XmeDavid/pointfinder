import apiClient from './client'
import type { Organization, OrgInvite, OrgMember } from '../../types/organization'

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

  removeMember: (orgId: string, userId: string) =>
    apiClient.delete(`/api/orgs/${orgId}/members/${userId}`),

  updatePermissions: (orgId: string, userId: string, permissions: number) =>
    apiClient.patch<OrgMember>(`/api/orgs/${orgId}/members/${userId}/permissions`, { permissions }).then(r => r.data),

  // Invite endpoints
  createInvite: (orgId: string, email: string) =>
    apiClient.post<OrgInvite>(`/api/orgs/${orgId}/invites`, { email }).then(r => r.data),

  listInvites: (orgId: string) =>
    apiClient.get<OrgInvite[]>(`/api/orgs/${orgId}/invites`).then(r => r.data),

  revokeInvite: (orgId: string, inviteId: string) =>
    apiClient.delete(`/api/orgs/${orgId}/invites/${inviteId}`),

  getMyOrgInvites: () =>
    apiClient.get<OrgInvite[]>('/api/org-invites/my').then(r => r.data),

  acceptOrgInvite: (inviteId: string) =>
    apiClient.post<OrgMember>(`/api/org-invites/${inviteId}/accept`).then(r => r.data),
}
