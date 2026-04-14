import apiClient from './client'
import type { Organization, OrgInvite, OrgMember } from '../../types/organization'

export const organizationsApi = {
  create: (name: string) =>
    apiClient.post<Organization>('/orgs', { name }).then(r => r.data),

  getById: (orgId: string) =>
    apiClient.get<Organization>(`/orgs/${orgId}`).then(r => r.data),

  update: (orgId: string, data: { name?: string }) =>
    apiClient.patch<Organization>(`/orgs/${orgId}`, data).then(r => r.data),

  delete: (orgId: string) =>
    apiClient.delete(`/orgs/${orgId}`),

  getMembers: (orgId: string) =>
    apiClient.get<OrgMember[]>(`/orgs/${orgId}/members`).then(r => r.data),

  removeMember: (orgId: string, userId: string) =>
    apiClient.delete(`/orgs/${orgId}/members/${userId}`),

  updatePermissions: (orgId: string, userId: string, permissions: number) =>
    apiClient.patch<OrgMember>(`/orgs/${orgId}/members/${userId}/permissions`, { permissions }).then(r => r.data),

  // Invite endpoints
  createInvite: (orgId: string, email: string) =>
    apiClient.post<OrgInvite>(`/orgs/${orgId}/invites`, { email }).then(r => r.data),

  listInvites: (orgId: string) =>
    apiClient.get<OrgInvite[]>(`/orgs/${orgId}/invites`).then(r => r.data),

  revokeInvite: (orgId: string, inviteId: string) =>
    apiClient.delete(`/orgs/${orgId}/invites/${inviteId}`),

  getMyOrgInvites: () =>
    apiClient.get<OrgInvite[]>('/org-invites/my').then(r => r.data),

  acceptOrgInvite: (inviteId: string) =>
    apiClient.post<OrgMember>(`/org-invites/${inviteId}/accept`).then(r => r.data),
}
