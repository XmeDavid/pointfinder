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
  maxResourceStorageBytes: number | null
}

export interface QuotaUsage {
  currentActiveGames: number
  currentMembers: number | null
  currentLiveGames: number | null
  currentResourceStorageBytes: number | null
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

export interface InvoiceLineItem {
  description: string
  amount: number
  quantity: number
}

export interface Invoice {
  id: string
  date: string
  amount: number
  currency: string
  status: 'paid' | 'open' | 'draft' | 'uncollectible' | 'void'
  planName: string | null
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  paymentMethodLast4: string | null
  paymentMethodBrand: string | null
  lineItems: InvoiceLineItem[]
  tax: number
  refundedAmount: number
  pdfUrl: string | null
}

export interface InvoiceListResponse {
  invoices: Invoice[]
  hasMore: boolean
}
