import type { FieldReading, TourState } from './types'

const NO_FIELD: FieldReading = { present: false, value: '', pressed: null }

export type TourStateOverrides = Partial<TourState> & {
  /** Synthetic DOM readings keyed by data-testid. Missing ids read as absent. */
  fields?: Record<string, Partial<FieldReading>>
  /** Synthetic aria-pressed winners keyed by group data-testid. */
  pressedGroups?: Record<string, string | null>
}

/**
 * A fully populated TourState with everything empty. Test-only, but it lives in
 * src (not src/test) because it is imported by tests in three folders.
 *
 * `fields` / `pressedGroups` fake the DOM readers; an explicit `field` or
 * `pressedIn` override still wins.
 */
export function makeTourState(overrides: TourStateOverrides = {}): TourState {
  const { fields = {}, pressedGroups = {}, ...rest } = overrides
  return {
    startedAt: 0,
    scenarioId: 'first-game',
    gameId: null,
    routeGameId: null,
    isDashboard: false,
    isNative: false,
    gamesAtStart: [],
    games: [],
    game: null,
    bases: [],
    challenges: [],
    teams: [],
    assignments: [],
    readiness: { allPassed: false, failing: [] },
    mode: 'build',
    drawerOpen: false,
    drawerTab: 'bases',
    selectedBaseId: null,
    selectedChallengeId: null,
    selectedTeamId: null,
    readinessExpanded: false,
    settingsPanelOpen: false,
    lastSuccess: {},
    stepCompletedAt: {},
    ackedSteps: new Set<string>(),
    laterSteps: new Set<string>(),
    clickedSteps: new Set<string>(),
    field: (testId: string) => ({ ...NO_FIELD, ...(fields[testId] ?? {}) }),
    pressedIn: (groupTestId: string) => pressedGroups[groupTestId] ?? null,
    ...rest,
  }
}
