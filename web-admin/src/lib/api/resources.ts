import apiClient from './client'
import type { Resource, ResourceFolder } from '../../types/resource'

export const resourcesApi = {
  listOrgResources: (orgId: string, params?: { folderId?: string; search?: string }) =>
    apiClient.get<Resource[]>(`/orgs/${orgId}/resources`, { params }).then(r => r.data),

  createOrgResource: (orgId: string, formData: FormData) =>
    apiClient.post<Resource>(`/orgs/${orgId}/resources`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  listGameResources: (gameId: string, params?: { folderId?: string; search?: string }) =>
    apiClient.get<Resource[]>(`/games/${gameId}/resources`, { params }).then(r => r.data),

  createGameResource: (gameId: string, formData: FormData) =>
    apiClient.post<Resource>(`/games/${gameId}/resources`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  get: (resourceId: string) =>
    apiClient.get<Resource>(`/resources/${resourceId}`).then(r => r.data),

  update: (resourceId: string, data: { name?: string; folderId?: string; sharedWithPlayers?: boolean; content?: string }) =>
    apiClient.put<Resource>(`/resources/${resourceId}`, data).then(r => r.data),

  delete: (resourceId: string) =>
    apiClient.delete(`/resources/${resourceId}`),

  listOrgFolders: (orgId: string) =>
    apiClient.get<ResourceFolder[]>(`/orgs/${orgId}/folders`).then(r => r.data),

  createOrgFolder: (orgId: string, data: { name: string; parentId?: string }) =>
    apiClient.post<ResourceFolder>(`/orgs/${orgId}/folders`, data).then(r => r.data),

  listGameFolders: (gameId: string) =>
    apiClient.get<ResourceFolder[]>(`/games/${gameId}/folders`).then(r => r.data),

  createGameFolder: (gameId: string, data: { name: string; parentId?: string }) =>
    apiClient.post<ResourceFolder>(`/games/${gameId}/folders`, data).then(r => r.data),

  updateFolder: (folderId: string, data: { name?: string; parentId?: string }) =>
    apiClient.put<ResourceFolder>(`/folders/${folderId}`, data).then(r => r.data),

  deleteFolder: (folderId: string) =>
    apiClient.delete(`/folders/${folderId}`),
}
