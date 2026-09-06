import type { ScenarioId, TutorialProgress, TutorialStatus } from '@/features/tutorials/types'
import apiClient from './client'

export interface UpdateTutorialProgressDto {
  status: TutorialStatus
  /** Scenario step id. `null` together with `in_progress` restarts the scenario. */
  currentStep: string | null
  /** Game a `setup-game` scenario is bound to. Omitted means "clear it". */
  gameId?: string | null
}

export const tutorialsApi = {
  list: async (): Promise<TutorialProgress[]> => {
    const { data } = await apiClient.get('/users/me/tutorials')
    return data
  },

  /**
   * Upsert one scenario's progress. The body is always sent whole — the server
   * replaces the row rather than merging — so an omitted `gameId` clears the
   * binding instead of silently keeping a stale one.
   */
  update: async (scenarioId: ScenarioId, body: UpdateTutorialProgressDto): Promise<TutorialProgress> => {
    const { data } = await apiClient.put(`/users/me/tutorials/${scenarioId}`, {
      status: body.status,
      currentStep: body.currentStep,
      gameId: body.gameId ?? null,
    })
    return data
  },
}
