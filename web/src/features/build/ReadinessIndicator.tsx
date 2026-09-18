import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getApiErrorMessage } from '@/lib/api/errors'
import { useUpdateGameStatus } from '@/hooks/mutations/useGameMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { ReadinessPanel } from './ReadinessPanel'
import { useReadinessChecks, type ReadinessCheck } from './useReadinessChecks'

/**
 * Wires the go-live pill to the workspace: the readiness queries, the
 * expanded flag in the store, the editors a blocker opens, and the status
 * mutation. The server stays the authority on going live; the workspace only
 * switches to command mode once the mutation succeeded.
 */
export default function ReadinessIndicator({
  gameId,
  gameStatus,
}: {
  gameId: string
  gameStatus?: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { checks, legacyNote, status, retry } = useReadinessChecks(gameId)
  const expanded = useWorkspaceStore((s) => s.readinessExpanded)
  const setReadinessExpanded = useWorkspaceStore((s) => s.setReadinessExpanded)
  const setMode = useWorkspaceStore((s) => s.setMode)
  const openDrawer = useWorkspaceStore((s) => s.openDrawer)
  const closeDrawer = useWorkspaceStore((s) => s.closeDrawer)
  const setSettingsPanelOpen = useWorkspaceStore((s) => s.setSettingsPanelOpen)
  const updateStatus = useUpdateGameStatus(gameId)

  const openCheck = useCallback(
    (check: ReadinessCheck) => {
      setMode('build')
      if (check.target === 'settings') {
        closeDrawer()
        setSettingsPanelOpen(true)
        return
      }
      setSettingsPanelOpen(false)
      openDrawer(check.target ?? 'bases')
    },
    [setMode, closeDrawer, setSettingsPanelOpen, openDrawer],
  )

  const goLive = useCallback(() => {
    updateStatus.mutate(
      { status: 'live' },
      {
        onSuccess: () => setMode('command'),
        // The server saw something this pill did not; refresh what it checks so
        // the blocker shows up instead of a stale "ready".
        onError: () => {
          for (const key of ['game', 'bases', 'challenges', 'teams', 'assignments', 'variables']) {
            void queryClient.invalidateQueries({ queryKey: [key, gameId] })
          }
        },
      },
    )
  }, [updateStatus, setMode, queryClient, gameId])

  // Only show in setup mode -- hide when game is live or ended
  if (gameStatus && gameStatus !== 'setup') return null

  return (
    <ReadinessPanel
      status={status}
      blockers={checks.filter((check) => !check.passed)}
      total={checks.length}
      legacyNote={legacyNote}
      expanded={expanded}
      onToggle={setReadinessExpanded}
      onOpenCheck={openCheck}
      onRetry={retry}
      onGoLive={goLive}
      launching={updateStatus.isPending}
      launchError={
        updateStatus.isError ? getApiErrorMessage(updateStatus.error, t('build.compose.launchFailed')) : null
      }
    />
  )
}
