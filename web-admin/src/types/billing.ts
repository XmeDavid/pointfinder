export interface QuotaResponse {
  context: 'personal' | 'org'
  orgId: string | null
  tier: string
  limits: QuotaLimits
  usage: QuotaUsage
  overrides: Record<string, unknown> | null
}

export interface QuotaLimits {
  maxActiveGames: number | null
  maxOperatorsPerGame: number | null
  maxBasesPerGame: number | null
  maxFileSizeBytes: number | null
  maxMembers: number | null
  maxLiveGames: number | null
  maxPlayersPerGame: number | null
}

export interface QuotaUsage {
  currentActiveGames: number
  currentMembers: number | null
  currentLiveGames: number | null
}

export interface UserSubscription {
  id: string
  tier: string
  status: string
  billingCycle: string | null
  currentPeriodEnd: string | null
  gracePeriodEnd: string | null
  quotaOverrides: Record<string, unknown> | null
}

export interface CheckoutResponse {
  url: string
  sessionId: string
}
