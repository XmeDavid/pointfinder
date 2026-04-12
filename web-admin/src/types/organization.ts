export interface Organization {
  id: string
  name: string
  slug: string
  createdBy: string
  subscriptionTier: OrgTier
  subscriptionStatus: SubscriptionStatus
  memberCount: number
  quotaOverrides: Record<string, unknown> | null
  createdAt: string
}

export interface OrgMember {
  id: string
  userId: string
  name: string
  email: string
  permissions: number
  joinedAt: string
}

export type OrgTier = 'free' | 'base' | 'high'
export type IndividualTier = 'free' | 'pro'
export type SubscriptionStatus = 'active' | 'past_due' | 'grace_period' | 'frozen' | 'cancelled'
export type BillingCycle = 'monthly' | 'annual' | 'lifetime'

export const OrgPermission = {
  OPERATE_GAMES: 1,
  CREATE_GAMES: 2,
  DELETE_GAMES: 4,
  INVITE_MEMBERS: 8,
  MANAGE_PERMS: 16,
  MANAGE_BILLING: 32,
} as const

export type OrgPermission = (typeof OrgPermission)[keyof typeof OrgPermission]

export function hasPermission(bitmask: number, permission: OrgPermission): boolean {
  return (bitmask & permission) !== 0
}

export interface Workspace {
  personal: {
    tier: IndividualTier
    status: SubscriptionStatus
    activeGames: number
  }
  organizations: OrgWorkspace[]
}

export interface OrgWorkspace {
  id: string
  name: string
  slug: string
  tier: OrgTier
  status: SubscriptionStatus
  memberCount: number
  liveGames: number
  permissions: number
}
