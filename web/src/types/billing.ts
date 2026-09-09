import type { SubscriptionStatus } from './organization'

export interface QuotaResponse {
  context: 'personal' | 'org'
  orgId: string | null
  tier: string
  limits: QuotaLimits
  usage: QuotaUsage
  overrides: Record<string, unknown> | null
  /** The workspace's subscription status. Absent on older servers. */
  status?: SubscriptionStatus
  /** End of the paid club term ("paid until"), or null when there is no term. */
  termEnd?: string | null
}

/**
 * One club invoice as both the admin panel and the club's own billing tab show
 * it. Amounts are in the smallest currency unit, as Stripe reports them.
 */
export interface OrgInvoice {
  id: string
  orgId: string
  stripeInvoiceId: string
  amountCents: number
  currency: string
  description: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  dueAt: string | null
  paidAt: string | null
  termMonths: number
  createdAt: string
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
  /** Whether bases may use location check-in. Paid tiers only; absent on older servers. */
  locationCheckIn?: boolean | null
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
