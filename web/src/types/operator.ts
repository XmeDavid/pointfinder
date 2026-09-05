export type UserRole = 'admin' | 'operator'

export interface Operator {
  id: string
  email: string
  name: string
  role: UserRole
  createdAt: string
}

export type InviteStatus = 'pending' | 'accepted' | 'expired'

export interface GameInvite {
  id: string
  gameId?: string
  gameName?: string
  email: string
  status: InviteStatus
  invitedBy: string
  inviterName?: string
  createdAt: string
}
