import type { CheckInMethod } from './checkIn'

export interface Base {
  id: string
  gameId: string
  name: string
  description: string
  lat: number
  lng: number
  /** One-based route position; absent when base order is not enforced. */
  sequenceNumber?: number | null
  nfcLinked: boolean
  nfcToken?: string
  hidden: boolean
  fixedChallengeId?: string
  tagIds?: string[]
  /** Stage this base belongs to (v2 stages feature) */
  stageId?: string | null
  /** How a team proves it reached this base. Copied from the game default at creation. */
  checkInMethod: CheckInMethod
  /** Raw operator value: null means "use the game default". Clamped 5..200 on write. */
  checkInRadiusM?: number | null
}
