export interface Team {
  id: string
  gameId: string
  name: string
  joinCode: string
  color: string
}

export interface Player {
  id: string
  teamId: string
  deviceId: string
  displayName: string
  /** PF-01: saved to an account. Never the address. */
  hasAccount?: boolean
}
