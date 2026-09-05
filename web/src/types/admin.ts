export interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  subscriptionTier: string
  subscriptionStatus: string
  createdAt: string
}

export interface AdminUserDetail extends AdminUser {
  billingCycle: string | null
  currentPeriodEnd: string | null
  gracePeriodEnd: string | null
  quotaOverrides: Record<string, unknown> | null
  adminNote: string | null
  gameCount: number
  orgCount: number
  resourceStorageBytes: number
}

export interface AdminOrg {
  id: string
  name: string
  slug: string
  subscriptionTier: string
  subscriptionStatus: string
  memberCount: number
  createdAt: string
}

export interface AdminOrgDetail extends AdminOrg {
  createdBy: string
  createdByName: string
  stripeCustomerId: string | null
  gracePeriodEnd: string | null
  quotaOverrides: Record<string, unknown> | null
  adminNote: string | null
  gameCount: number
  resourceStorageBytes: number
  members: Array<{
    id: string
    userId: string
    name: string
    email: string
    permissions: number
    joinedAt: string
  }>
}
