import { create } from 'zustand'
import type { ScenarioId, TutorialProgress } from './types'

interface TourStoreState {
  activeScenario: ScenarioId | null
  gameId: string | null
  /** Ids of the games that existed when this run started. */
  gamesAtStart: string[]
  /** Step the run is on. Null means "at the first effective step". */
  currentStepId: string | null
  paused: boolean
  startedAt: number
  ackedSteps: Set<string>
  laterSteps: Set<string>
  clickedSteps: Set<string>
  stepCompletedAt: Record<string, number>
  lastSuccess: Record<string, number>
  /** Bumped by the host's DOM input/change/click capture listeners so predicates re-read the DOM. */
  tick: number
  /** Hydrated from the server; in-memory only until then. */
  progress: Partial<Record<ScenarioId, TutorialProgress>>
  /** True once the server's rows have been merged in; the welcome card waits for it. */
  progressHydrated: boolean
}

export interface StartOptions {
  gameId?: string
  gamesAtStart?: string[]
  /** Begin at a named step (Resume). */
  stepId?: string | null
}

interface TourStoreActions {
  start: (scenarioId: ScenarioId, opts?: StartOptions) => void
  pause: () => void
  resume: () => void
  /** Clears the active run, keeps progress. */
  stop: () => void
  /** Marks the active scenario completed in `progress` and clears the run. */
  complete: () => void
  /** Records a skipped row for a scenario the operator declined. */
  skip: (scenarioId: ScenarioId) => void
  ack: (stepId: string) => void
  later: (stepId: string) => void
  clicked: (stepId: string) => void
  setCurrentStep: (stepId: string | null) => void
  markStepCompleted: (stepId: string, at: number) => void
  bindGame: (gameId: string) => void
  recordSuccess: (key: string, at: number) => void
  bumpTick: () => void
  setProgress: (rows: TutorialProgress[]) => void
  reset: () => void
}

type RunFields = Omit<TourStoreState, 'lastSuccess' | 'tick' | 'progress' | 'progressHydrated'>

const noRun = (): RunFields => ({
  activeScenario: null,
  gameId: null,
  gamesAtStart: [],
  currentStepId: null,
  paused: false,
  startedAt: 0,
  ackedSteps: new Set<string>(),
  laterSteps: new Set<string>(),
  clickedSteps: new Set<string>(),
  stepCompletedAt: {},
})

const initialState = (): TourStoreState => ({
  ...noRun(),
  lastSuccess: {},
  tick: 0,
  progress: {},
  progressHydrated: false,
})

/** A fresh run. `lastSuccess` survives: it is a log of the app, not of the run. */
function freshRun(scenarioId: ScenarioId, opts: StartOptions | undefined): RunFields {
  return {
    ...noRun(),
    activeScenario: scenarioId,
    gameId: opts?.gameId ?? null,
    gamesAtStart: opts?.gamesAtStart ?? [],
    currentStepId: opts?.stepId ?? null,
    startedAt: Date.now(),
  }
}

export const useTourStore = create<TourStoreState & TourStoreActions>()((set) => ({
  ...initialState(),

  start: (scenarioId, opts) => set(freshRun(scenarioId, opts)),
  pause: () => set({ paused: true }),
  resume: () => set({ paused: false }),
  stop: () => set(noRun()),

  complete: () =>
    set((s) => {
      if (!s.activeScenario) return noRun()
      const now = new Date().toISOString()
      const existing = s.progress[s.activeScenario]
      const row: TutorialProgress = {
        scenarioId: s.activeScenario,
        status: 'completed',
        currentStep: s.currentStepId,
        gameId: s.gameId,
        startedAt: existing?.startedAt ?? new Date(s.startedAt || Date.now()).toISOString(),
        completedAt: now,
      }
      return { ...noRun(), progress: { ...s.progress, [s.activeScenario]: row } }
    }),

  skip: (scenarioId) =>
    set((s) => ({
      progress: {
        ...s.progress,
        [scenarioId]: {
          scenarioId,
          status: 'skipped',
          currentStep: null,
          gameId: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
        },
      },
    })),

  ack: (stepId) => set((s) => ({ ackedSteps: new Set(s.ackedSteps).add(stepId) })),
  later: (stepId) => set((s) => ({ laterSteps: new Set(s.laterSteps).add(stepId) })),
  clicked: (stepId) => set((s) => ({ clickedSteps: new Set(s.clickedSteps).add(stepId) })),
  setCurrentStep: (stepId) => set((s) => (s.currentStepId === stepId ? s : { currentStepId: stepId })),
  markStepCompleted: (stepId, at) =>
    set((s) => (s.stepCompletedAt[stepId] === at ? s : { stepCompletedAt: { ...s.stepCompletedAt, [stepId]: at } })),
  bindGame: (gameId) => set({ gameId }),
  recordSuccess: (key, at) => set((s) => ({ lastSuccess: { ...s.lastSuccess, [key]: at } })),
  bumpTick: () => set((s) => ({ tick: s.tick + 1 })),
  // Server rows are merged over the local map, never swapped in: a row the
  // operator just wrote (Skip on the welcome card) must survive a hydration
  // that raced it and does not know about it yet.
  setProgress: (rows) =>
    set((s) => ({
      progressHydrated: true,
      progress: rows.reduce<Partial<Record<ScenarioId, TutorialProgress>>>((acc, row) => {
        acc[row.scenarioId] = row
        return acc
      }, { ...s.progress }),
    })),
  reset: () => set(initialState()),
}))
