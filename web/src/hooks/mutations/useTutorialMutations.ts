import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import type { PracticeGameDto, UpdateTutorialProgressDto } from '@/lib/api/tutorials'
import type { ScenarioId } from '@/features/tutorials/types'

export type UpdateTutorialProgressVariables = UpdateTutorialProgressDto & {
  scenarioId: ScenarioId
}

/**
 * Explicit progress writes (the library's Restart button). The debounced
 * write-through in `features/tutorials/progressSync.ts` calls `tutorialsApi`
 * directly instead, because it must be able to flush outside React's lifecycle.
 */
export function useUpdateTutorialProgress() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['tutorials', 'update'],
    mutationFn: ({ scenarioId, ...body }: UpdateTutorialProgressVariables) =>
      tutorialsApi.update(scenarioId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tutorials', 'me'] })
    },
  })
}

/** Creates a practice game for a `practice-game` scenario; the games list refetches. */
export function useCreatePracticeGame() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['tutorial', 'practice-game'],
    mutationFn: ({ scenarioId, body }: { scenarioId: ScenarioId; body: PracticeGameDto }) =>
      tutorialsApi.createPracticeGame(scenarioId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] })
      qc.invalidateQueries({ queryKey: ['tutorials', 'me'] })
    },
  })
}
