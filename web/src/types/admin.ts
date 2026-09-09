import type { Organization, OrgTier, SubscriptionStatus } from './organization'

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
  subscriptionTier: OrgTier
  subscriptionStatus: SubscriptionStatus
  memberCount: number
  /** End of the paid club term ("paid until"), or null when the club has no term. */
  termEnd: string | null
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

/**
 * What an admin sends to stand a club up. `quotaOverrides` carries the agreed
 * limits key by key: a number caps it, an explicit `null` makes it unlimited,
 * and an absent key leaves the tier default in place.
 */
export interface CreateClubRequest {
  name: string
  adminEmail: string
  quotaOverrides?: Record<string, number | boolean | null>
  termEnd?: string
  adminNote?: string
}

/**
 * Exactly one of `adminUserId` and `inviteId` comes back: the club
 * administrator either already had an account and is a member now, or was sent
 * a registration invite.
 */
export interface CreateClubResult {
  org: Organization
  adminEmail: string
  adminUserId: string | null
  inviteId: string | null
}

/** A partial update to a club. Only the fields present are applied. */
export interface UpdateClubRequest {
  name?: string
  tier?: OrgTier
  status?: SubscriptionStatus
  /**
   * The whole override map. Wider than the club form's own keys because a deal
   * may carry a per-deal key the form does not manage, and a save must not
   * drop it.
   */
  quotaOverrides?: Record<string, unknown> | null
  termEnd?: string | null
  gracePeriodEnd?: string | null
  adminNote?: string | null
}

/** What an admin fills in to bill a club for an agreed term. */
export interface IssueInvoiceRequest {
  amountCents: number
  currency?: string
  description: string
  dueDays?: number
  termMonths?: number
}
