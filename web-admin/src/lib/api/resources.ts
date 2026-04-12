import apiClient from './client'
import type { Resource, ResourceFolder } from '../../types/resource'

export const resourcesApi = {
  listOrgResources: (orgId: string, params?: { folderId?: string; search?: string }) =>
    apiClient.get<Resource[]>(`/api/orgs/${orgId}/resources`, { params }).then(r => r.data),

  createOrgResource: (orgId: string, formData: FormData) =>
    apiClient.post<Resource>(`/api/orgs/${orgId}/resources`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  listGameResources: (gameId: string, params?: { folderId?: string; search?: string }) =>
    apiClient.get<Resource[]>(`/api/games/${gameId}/resources`, { params }).then(r => r.data),

  createGameResource: (gameId: string, formData: FormData) =>
    apiClient.post<Resource>(`/api/games/${gameId}/resources`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  get: (resourceId: string) =>
    apiClient.get<Resource>(`/api/resources/${resourceId}`).then(r => r.data),

  update: (resourceId: string, data: { name?: string; folderId?: string; sharedWithPlayers?: boolean; content?: string }) =>
    apiClient.put<Resource>(`/api/resources/${resourceId}`, data).then(r => r.data),

  delete: (resourceId: string) =>
    apiClient.delete(`/api/resources/${resourceId}`),

  listOrgFolders: (orgId: string) =>
    apiClient.get<ResourceFolder[]>(`/api/orgs/${orgId}/folders`).then(r => r.data),

  createOrgFolder: (orgId: string, data: { name: string; parentId?: string }) =>
    apiClient.post<ResourceFolder>(`/api/orgs/${orgId}/folders`, data).then(r => r.data),

  listGameFolders: (gameId: string) =>
    apiClient.get<ResourceFolder[]>(`/api/games/${gameId}/folders`).then(r => r.data),

  createGameFolder: (gameId: string, data: { name: string; parentId?: string }) =>
    apiClient.post<ResourceFolder>(`/api/games/${gameId}/folders`, data).then(r => r.data),

  updateFolder: (folderId: string, data: { name?: string; parentId?: string }) =>
    apiClient.put<ResourceFolder>(`/api/folders/${folderId}`, data).then(r => r.data),

  deleteFolder: (folderId: string) =>
    apiClient.delete(`/api/folders/${folderId}`),
}
