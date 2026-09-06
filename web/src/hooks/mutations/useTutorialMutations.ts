import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import type { UpdateTutorialProgressDto } from '@/lib/api/tutorials'
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
