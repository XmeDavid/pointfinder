import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '@/stores/workspace'
import type { TourActions } from './types'

/**
 * The only automation a step is allowed: reveal an anchor. Nothing here creates
 * an entity or changes game status — a tutorial prepares, it never performs.
 */
export function useTourActions(): TourActions {
  const navigate = useNavigate()
  const setMode = useWorkspaceStore((s) => s.setMode)
  const openDrawer = useWorkspaceStore((s) => s.openDrawer)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const selectChallenge = useWorkspaceStore((s) => s.selectChallenge)
  const selectTeam = useWorkspaceStore((s) => s.selectTeam)
  const setReadinessExpanded = useWorkspaceStore((s) => s.setReadinessExpanded)
  const setSettingsPanelOpen = useWorkspaceStore((s) => s.setSettingsPanelOpen)

  return useMemo<TourActions>(
    () => ({
      setMode,
      openDrawer: (tab) => openDrawer(tab),
      selectBase,
      selectChallenge,
      selectTeam,
      setReadinessExpanded,
      setSettingsPanelOpen,
      navigate: (to) => navigate(to),
    }),
    [navigate, openDrawer, selectBase, selectChallenge, selectTeam, setMode, setReadinessExpanded, setSettingsPanelOpen],
  )
}
