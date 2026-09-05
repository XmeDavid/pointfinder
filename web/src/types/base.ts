export interface Base {
  id: string
  gameId: string
  name: string
  description: string
  lat: number
  lng: number
  nfcLinked: boolean
  nfcToken?: string
  hidden: boolean
  fixedChallengeId?: string
  tagIds?: string[]
  /** Stage this base belongs to (v2 stages feature) */
  stageId?: string | null
}
