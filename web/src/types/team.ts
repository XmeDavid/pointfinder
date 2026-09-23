export interface Team {
  id: string
  gameId: string
  name: string
  joinCode: string
  color: string
  /** OW-05: most players this team takes; null or absent means no limit. */
  maxPlayers?: number | null
}

export interface Player {
  id: string
  teamId: string
  deviceId: string
  displayName: string
  /** PF-01: saved to an account. Never the address. */
  hasAccount?: boolean
}
