import type { Assignment, Base, Challenge, Game, Team } from '@/types'
import type { DrawerTab, GameMode } from '@/stores/workspace'

export type ScenarioId = 'first-game' | 'fixed-route' | 'exploration'
/**
 * `new-game`: the operator creates the practice game through the real dialog
 * (the first lesson). `practice-game`: the server creates and seeds one on Start.
 */
export type ScenarioEntry = 'new-game' | 'practice-game'
export type TutorialStatus = 'in_progress' | 'completed' | 'skipped'

export interface TutorialProgress {
  scenarioId: ScenarioId
  status: TutorialStatus
  currentStep: string | null
  /**
   * Game a `setup-game` scenario is bound to, so Resume can return to it.
   * Null for `new-game` scenarios and for rows written before a game existed.
   */
  gameId: string | null
  startedAt: string
  completedAt: string | null
}

export interface FieldReading {
  present: boolean
  /** input/textarea .value; contenteditable (ProseMirror) textContent; else element textContent. Trimmed. */
  value: string
  /** aria-pressed or aria-checked parsed; null when the element carries neither. */
  pressed: boolean | null
}

export interface TourState {
  startedAt: number
  scenarioId: ScenarioId | null
  /** Game the scenario is bound to. Set by the engine when a new-game step 1 passes, or at start for setup-game. */
  gameId: string | null
  /** Game id from the current URL (/game/:id), else null. */
  routeGameId: string | null
  isDashboard: boolean
  isNative: boolean
  /**
   * Ids of the games that already existed when the run started. `Game` carries
   * no creation timestamp, so this is how "the game just created" is recognised.
   */
  gamesAtStart: readonly string[]
  games: Game[]
  game: Game | null
  bases: Base[]
  challenges: Challenge[]
  teams: Team[]
  assignments: Assignment[]
  /** failing = i18n labels of failed checks. */
  readiness: { allPassed: boolean; failing: string[] }
  mode: GameMode
  drawerOpen: boolean
  drawerTab: DrawerTab
  selectedBaseId: string | null
  selectedChallengeId: string | null
  selectedTeamId: string | null
  readinessExpanded: boolean
  settingsPanelOpen: boolean
  /** ms timestamp of the last successful mutation per MUTATION_KEYS key, e.g. lastSuccess['base:update']. */
  lastSuccess: Record<string, number>
  /** ms timestamp at which each step id completed in the active run. */
  stepCompletedAt: Record<string, number>
  ackedSteps: ReadonlySet<string>
  laterSteps: ReadonlySet<string>
  /** Steps whose anchor has been clicked, for predicates that need a click plus a follow-up. */
  clickedSteps: ReadonlySet<string>
  field: (testId: string) => FieldReading
  /** testid of the aria-pressed=true child. */
  pressedIn: (groupTestId: string) => string | null
}

export interface TourActions {
  setMode: (mode: GameMode) => void
  openDrawer: (tab: DrawerTab) => void
  /** Closes the content drawer so an anchor outside it (readiness, modes, settings) is not behind its scrim. */
  closeDrawer: () => void
  selectBase: (id: string | null) => void
  selectChallenge: (id: string | null) => void
  selectTeam: (id: string | null) => void
  setReadinessExpanded: (open: boolean) => void
  setSettingsPanelOpen: (open: boolean) => void
  navigate: (to: string) => void
}

export type StepDone =
  | { kind: 'predicate'; test: (s: TourState) => boolean }
  | { kind: 'click' }
  | { kind: 'ack' }

export interface StepCopy {
  /** i18n key. */
  title: string
  /** i18n key. */
  body: string
  /** i18n key. */
  aside?: string
  /** i18n key for the secondary "I'll do it later" button; presence renders the button. */
  later?: string
}

export interface Step {
  id: string
  /** data-testid to spotlight. The empty string means "no spotlight, centred bubble". */
  anchor: string | ((s: TourState) => string)
  route?: 'dashboard' | 'workspace'
  when?: (s: TourState) => boolean
  /** Reveal the anchor. Never a domain action. */
  prepare?: (a: TourActions, s: TourState) => void
  done: StepDone
  copy: StepCopy
  /** First matching entry replaces `copy.body`. */
  branchCopy?: Array<{ when: (s: TourState) => boolean; body: string }>
}

export interface Scenario {
  id: ScenarioId
  entry: ScenarioEntry
  /** i18n key. */
  title: string
  /** i18n key. */
  blurb: string
  steps: Step[]
}
