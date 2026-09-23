import type { CheckInMethod } from './checkIn'
export type GameStatus = 'setup' | 'live' | 'ended'

export type TileSource =
  | 'osm'
  | 'voyager'
  | 'positron'
  | 'swisstopo'
  | 'swisstopo-sat'

export type UnlockTrigger = 'CHECK_IN' | 'SUBMISSION' | 'COMPLETED'

export interface Game {
  id: string
  name: string
  description: string
  startDate: string | null
  endDate: string | null
  status: GameStatus
  createdBy: string
  operatorIds: string[]
  enforceBaseOrder?: boolean
  /** OW-40: whether any route is enforced (the default route or any stage); null when unresolved. */
  routeOrderEnforced?: boolean | null
  uniformAssignment: boolean
  broadcastEnabled: boolean
  broadcastCode: string | null
  tileSource: string
  /** ISO 639-1 code of the content's language; null when the organizer did not say. */
  contentLanguage?: string | null
  unlockTrigger: string
  tags?: import('./tag').GameTag[]
  orgId?: string | null
  orgName?: string | null
  defaultCheckInMethod: CheckInMethod
  defaultCheckInRadiusM: number
  /** Scenario id when this is a tutorial's practice game; null or absent for a normal game. */
  tutorialScenario?: string | null
  /** When the server ends a practice game; null or absent for a normal game. */
  tutorialExpiresAt?: string | null
  /**
   * Whether this game may use location check-in, as the server will enforce it.
   * Only an explicit false locks the picker; absent on older servers.
   */
  locationCheckInAllowed?: boolean | null
}
