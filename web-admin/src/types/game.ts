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
  uniformAssignment: boolean
  broadcastEnabled: boolean
  broadcastCode: string | null
  tileSource: string
  unlockTrigger: string
  tags?: import('./tag').GameTag[]
}
