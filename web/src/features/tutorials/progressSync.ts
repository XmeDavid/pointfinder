import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import { useTutorialProgress } from '@/hooks/queries/useTutorialProgress'
import { useAuthStore } from '@/lib/auth/store'
import { useTourStore } from './store'
import type { ScenarioId, TutorialProgress, TutorialStatus } from './types'

/** Step churn is noisy; one write per half-second is plenty for a UI preference. */
export const PROGRESS_WRITE_DEBOUNCE_MS = 500

interface PendingWrite {
  scenarioId: ScenarioId
  status: TutorialStatus
  currentStep: string | null
  gameId: string | null
}

/**
 * What this module believes the server already holds, keyed by scenario id.
 * Module-level rather than per-hook because hydration and write-through are two
 * hooks that must agree, and exactly one `TourHost` is ever mounted.
 */
const syncedRows = new Map<string, string>()
/** Writes on the wire, so a store change during a request does not re-queue the same row. */
const inflightRows = new Map<string, string>()

function rowKey(write: PendingWrite): string {
  return `${write.status}|${write.currentStep ?? ''}|${write.gameId ?? ''}`
}

/** Record rows that came from the server so they are never written back. */
export function markProgressSynced(rows: TutorialProgress[]): void {
  for (const row of rows) {
    syncedRows.set(
      row.scenarioId,
      rowKey({
        scenarioId: row.scenarioId,
        status: row.status,
        currentStep: row.currentStep,
        gameId: row.gameId ?? null,
      }),
    )
  }
}

/** Forget everything this module knows. Used on logout and by tests. */
export function resetProgressSync(): void {
  syncedRows.clear()
  inflightRows.clear()
}

type TourStoreSnapshot = ReturnType<typeof useTourStore.getState>

function desiredWrites(state: TourStoreSnapshot): PendingWrite[] {
  const byScenario = new Map<string, PendingWrite>()

  for (const [scenarioId, row] of Object.entries(state.progress)) {
    if (!row) continue
    byScenario.set(scenarioId, {
      scenarioId: scenarioId as ScenarioId,
      status: row.status,
      currentStep: row.currentStep,
      gameId: row.gameId ?? null,
    })
  }

  // A live run always describes the truth better than the hydrated row does.
  const active = state.activeScenario
  if (active) {
    byScenario.set(active, {
      scenarioId: active,
      status: 'in_progress',
      currentStep: state.currentStepId,
      gameId: state.gameId,
    })
  }

  return Array.from(byScenario.values())
}

function isOperatorSession(): boolean {
  const auth = useAuthStore.getState()
  const role = auth.user?.role
  return auth.isAuthenticated && (role === 'operator' || role === 'admin')
}

/**
 * Fill `useTourStore.progress` from the server once the operator is known.
 * Mounted by `TourHost`; players and anonymous visitors never reach it.
 */
export function useProgressHydration(): {
  isLoading: boolean
  isError: boolean
  refetch: () => void
} {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const role = useAuthStore((s) => s.user?.role)
  const setProgress = useTourStore((s) => s.setProgress)

  const enabled = isAuthenticated && (role === 'operator' || role === 'admin')
  const query = useTutorialProgress({ enabled })

  useEffect(() => {
    if (!query.data) return
    // Order matters: mark first so the write-through subscription that fires
    // from setProgress already sees these rows as server-known.
    markProgressSynced(query.data)
    setProgress(query.data)
  }, [query.data, setProgress])

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

/**
 * Write every meaningful tour-store change back to the server, debounced.
 * A row counts as synced only once its write succeeds; a failed write is
 * retried by the next change.
 */
export function useProgressWriteThrough(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const pending = new Map<string, PendingWrite>()
    let timer: ReturnType<typeof setTimeout> | null = null

    const flush = (force = false) => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (pending.size === 0) return
      const writes = Array.from(pending.values())
      pending.clear()
      // Best effort on logout: the session may already be gone, but the
      // operator holds no other copy of this progress.
      if (!force && !isOperatorSession()) return
      for (const write of writes) {
        const key = rowKey(write)
        inflightRows.set(write.scenarioId, key)
        void tutorialsApi
          .update(write.scenarioId, {
            status: write.status,
            currentStep: write.currentStep,
            gameId: write.gameId,
          })
          .then(() => {
            syncedRows.set(write.scenarioId, key)
            void queryClient.invalidateQueries({ queryKey: ['tutorials', 'me'] })
          })
          .catch(() => {
            // A dropped preference write is not worth a toast; the next change retries.
          })
          .finally(() => {
            if (inflightRows.get(write.scenarioId) === key) inflightRows.delete(write.scenarioId)
          })
      }
    }

    const evaluate = (state: TourStoreSnapshot) => {
      if (!isOperatorSession()) return
      let changed = false
      for (const write of desiredWrites(state)) {
        const key = rowKey(write)
        if (syncedRows.get(write.scenarioId) === key) continue
        if (inflightRows.get(write.scenarioId) === key) continue
        if (pending.get(write.scenarioId) && rowKey(pending.get(write.scenarioId)!) === key) continue
        pending.set(write.scenarioId, write)
        changed = true
      }
      if (!changed) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => flush(), PROGRESS_WRITE_DEBOUNCE_MS)
    }

    const unsubscribeTour = useTourStore.subscribe(evaluate)

    const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
      if (previous.isAuthenticated && !state.isAuthenticated) {
        flush(true)
        resetProgressSync()
        useTourStore.getState().reset()
      }
    })

    return () => {
      flush()
      unsubscribeTour()
      unsubscribeAuth()
    }
  }, [queryClient])
}
