import type { QueryClient } from '@tanstack/react-query'

/**
 * The keys a scenario predicate may compare against `TourState.lastSuccess`.
 * Each is the mutation's two-segment `mutationKey` joined with a colon.
 */
export const MUTATION_KEYS = {
  baseCreate: 'base:create',
  baseUpdate: 'base:update',
  challengeCreate: 'challenge:create',
  challengeUpdate: 'challenge:update',
  assignmentsSet: 'assignments:set',
  assignmentsCreate: 'assignments:create',
  gameUpdate: 'game:update',
  gameStatus: 'game:status',
  gameCreate: 'game:create',
} as const

export type MutationLogKey = (typeof MUTATION_KEYS)[keyof typeof MUTATION_KEYS]

/**
 * Watches the mutation cache and reports every successful mutation whose key is
 * exactly two strings. Returns the unsubscribe function.
 */
export function subscribeMutationLog(
  queryClient: QueryClient,
  record: (key: string, at: number) => void,
): () => void {
  return queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated') return
    const mutation = event.mutation
    if (!mutation || mutation.state.status !== 'success') return
    const key = mutation.options.mutationKey
    if (!Array.isArray(key) || key.length !== 2) return
    const [group, action] = key
    if (typeof group !== 'string' || typeof action !== 'string') return
    record(`${group}:${action}`, Date.now())
  })
}
