import type { ScenarioId, TutorialProgress, TutorialStatus } from '@/features/tutorials/types'
import type { Game } from '@/types/game'
import apiClient from './client'

export interface UpdateTutorialProgressDto {
  status: TutorialStatus
  /** Scenario step id. `null` together with `in_progress` restarts the scenario. */
  currentStep: string | null
  /** Game a `setup-game` scenario is bound to. Omitted means "clear it". */
  gameId?: string | null
}

export interface PracticeGameDto {
  /** Localized game name, shown wherever the game is listed. */
  name: string
  /** Where the seeded bases go (the operator's map centre). Both or neither. */
  lat?: number
  lng?: number
}

export const tutorialsApi = {
  /** Creates, seeds and binds a practice game for a `practice-game` scenario. */
  createPracticeGame: async (scenarioId: ScenarioId, body: PracticeGameDto): Promise<Game> => {
    const { data } = await apiClient.post(`/users/me/tutorials/${scenarioId}/practice-game`, body)
    return data
  },

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
