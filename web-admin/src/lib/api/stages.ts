import apiClient from './client'
import type { Stage } from '@/types/stage'

export interface CreateStageDto {
  name: string
  description?: string | null
  transitionType: 'scheduled' | 'trigger' | 'manual'
  scheduledAt?: string | null
  triggerBaseId?: string | null
  baseIds?: string[]
}

export type UpdateStageDto = Partial<CreateStageDto>

export const stagesApi = {
  list: async (gameId: string): Promise<Stage[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/stages`)
    return data
  },

  create: async (gameId: string, dto: CreateStageDto): Promise<Stage> => {
    const { data } = await apiClient.post(`/games/${gameId}/stages`, dto)
    return data
  },

  update: async (gameId: string, stageId: string, dto: UpdateStageDto): Promise<Stage> => {
    const { data } = await apiClient.put(`/games/${gameId}/stages/${stageId}`, dto)
    return data
  },

  delete: async (gameId: string, stageId: string): Promise<void> => {
    await apiClient.delete(`/games/${gameId}/stages/${stageId}`)
  },

  reorder: async (gameId: string, order: string[]): Promise<void> => {
    await apiClient.patch(`/games/${gameId}/stages/reorder`, { order })
  },
}
