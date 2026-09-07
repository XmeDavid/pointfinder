import { useMemo } from 'react'
import { useLocation, useMatch } from 'react-router-dom'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useGame, useGames } from '@/hooks/queries/useGames'
import { useTeams } from '@/hooks/queries/useTeams'
import { useReadinessChecks } from '@/features/build/useReadinessChecks'
import { useWorkspaceStore } from '@/stores/workspace'
import { isNative } from '@/platform/runtime'
import { useTourStore } from './store'
import { readAnchorField, pressedIn } from './dom'
import type { FieldReading, TourState } from './types'

/**
 * One snapshot of everything a step predicate may look at. Called only from
 * inside a running tour, so the extra queries never fire for an operator who is
 * not in a tutorial.
 */
export function useTourState(): TourState {
  const location = useLocation()
  const gameRoute = useMatch('/game/:id')
  const routeGameId = gameRoute?.params.id ?? null

  const scenarioId = useTourStore((s) => s.activeScenario)
  const boundGameId = useTourStore((s) => s.gameId)
  const gamesAtStart = useTourStore((s) => s.gamesAtStart)
  const startedAt = useTourStore((s) => s.startedAt)
  const ackedSteps = useTourStore((s) => s.ackedSteps)
  const laterSteps = useTourStore((s) => s.laterSteps)
  const clickedSteps = useTourStore((s) => s.clickedSteps)
  const stepCompletedAt = useTourStore((s) => s.stepCompletedAt)
  const lastSuccess = useTourStore((s) => s.lastSuccess)
  // DOM reads are frozen between ticks so a predicate cannot fire on an
  // unrelated re-render mid-keystroke; the host bumps the tick once typing
  // settles, and immediately on clicks, changes and new DOM nodes.
  const tick = useTourStore((s) => s.tick)
  const { field, pressedIn: pressedInGroup } = useMemo(() => {
    const fields = new Map<string, FieldReading>()
    const groups = new Map<string, string | null>()
    return {
      field: (testId: string): FieldReading => {
        let reading = fields.get(testId)
        if (!reading) {
          reading = readAnchorField(testId)
          fields.set(testId, reading)
        }
        return reading
      },
      pressedIn: (groupTestId: string): string | null => {
        if (!groups.has(groupTestId)) groups.set(groupTestId, pressedIn(groupTestId))
        return groups.get(groupTestId) ?? null
      },
    }
    // `tick` is the deliberate invalidation key for the DOM snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  const gameId = boundGameId ?? null
  const queryGameId = gameId ?? undefined

  const { data: games } = useGames()
  const { data: game } = useGame(queryGameId)
  const { data: bases } = useBases(queryGameId)
  const { data: challenges } = useChallenges(queryGameId)
  const { data: teams } = useTeams(queryGameId)
  const { data: assignments } = useAssignments(queryGameId)
  const readiness = useReadinessChecks(gameId ?? '')

  const mode = useWorkspaceStore((s) => s.mode)
  const drawerOpen = useWorkspaceStore((s) => s.drawerOpen)
  const drawerTab = useWorkspaceStore((s) => s.drawerTab)
  const selectedBaseId = useWorkspaceStore((s) => s.selectedBaseId)
  const selectedChallengeId = useWorkspaceStore((s) => s.selectedChallengeId)
  const selectedTeamId = useWorkspaceStore((s) => s.selectedTeamId)
  const readinessExpanded = useWorkspaceStore((s) => s.readinessExpanded)
  const settingsPanelOpen = useWorkspaceStore((s) => s.settingsPanelOpen)

  return {
    startedAt,
    scenarioId,
    gameId,
    routeGameId,
    isDashboard: location.pathname === '/dashboard',
    isNative: isNative(),
    gamesAtStart,
    games: games ?? [],
    game: game ?? null,
    bases: bases ?? [],
    challenges: challenges ?? [],
    teams: teams ?? [],
    assignments: assignments ?? [],
    readiness: {
      allPassed: readiness.allPassed,
      failing: readiness.checks.filter((check) => !check.passed).map((check) => check.label),
    },
    mode,
    drawerOpen,
    drawerTab,
    selectedBaseId,
    selectedChallengeId,
    selectedTeamId,
    readinessExpanded,
    settingsPanelOpen,
    lastSuccess,
    stepCompletedAt,
    ackedSteps,
    laterSteps,
    clickedSteps,
    field,
    pressedIn: pressedInGroup,
  }
}
