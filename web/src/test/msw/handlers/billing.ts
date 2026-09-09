import { http, HttpResponse } from 'msw'
import type { InvoiceListResponse, UserSubscription } from '@/types/billing'

interface RecordedCheckout {
  plan: string
  cycle: string
}

let checkouts: RecordedCheckout[] = []
let portals = 0
let status: UserSubscription | null = null
let invoices: InvoiceListResponse = { invoices: [], hasMore: false }

/**
 * In-memory stand-in for the billing endpoints, shaped so tests can seed a
 * subscription and assert exactly which checkout went out.
 */
export const billingStore = {
  reset(): void {
    checkouts = []
    portals = 0
    status = null
    invoices = { invoices: [], hasMore: false }
  },
  seedStatus(next: UserSubscription | null): void {
    status = next
  },
  seedInvoices(next: InvoiceListResponse): void {
    invoices = next
  },
  /** Checkout sessions requested, in order. */
  checkouts(): RecordedCheckout[] {
    return checkouts.map((entry) => ({ ...entry }))
  },
  portalCount(): number {
    return portals
  },
}

export const billingHandlers = [
  http.post('/api/billing/checkout', async ({ request }) => {
    const body = (await request.json()) as RecordedCheckout
    checkouts.push({ plan: body.plan, cycle: body.cycle })
    return HttpResponse.json({ url: 'https://checkout.example/session', sessionId: 'cs_test' })
  }),

  http.post('/api/billing/portal', () => {
    portals += 1
    return HttpResponse.json({ url: 'https://portal.example/session' })
  }),

  http.get('/api/billing/status', () =>
    status ? HttpResponse.json(status) : new HttpResponse(null, { status: 404 }),
  ),

  http.get('/api/billing/invoices', () => HttpResponse.json(invoices)),
]
