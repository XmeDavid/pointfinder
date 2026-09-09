import { http, HttpResponse } from 'msw'
import type { AdminOrg, AdminOrgDetail, AdminUser, CreateClubRequest, IssueInvoiceRequest, UpdateClubRequest } from '@/types/admin'
import type { OrgInvoice } from '@/types/billing'

export function createAdminOrg(overrides: Partial<AdminOrg> = {}): AdminOrg {
  return {
    id: 'org-1',
    name: 'Scout Group 42',
    slug: 'scout-group-42',
    subscriptionTier: 'club',
    subscriptionStatus: 'active',
    memberCount: 4,
    termEnd: '2027-07-31T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function createAdminOrgDetail(overrides: Partial<AdminOrgDetail> = {}): AdminOrgDetail {
  return {
    ...createAdminOrg(),
    createdBy: 'user-1',
    createdByName: 'Test Operator',
    stripeCustomerId: 'cus_test',
    gracePeriodEnd: null,
    quotaOverrides: { max_members: 15, max_bases_per_game: null },
    adminNote: null,
    gameCount: 2,
    resourceStorageBytes: 1024,
    members: [
      {
        id: 'member-1',
        userId: 'user-1',
        name: 'Test Operator',
        email: 'test@example.com',
        permissions: 127,
        joinedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'member-2',
        userId: 'user-2',
        name: 'Second Operator',
        email: 'second@example.com',
        permissions: 3,
        joinedAt: '2026-02-01T00:00:00Z',
      },
    ],
    ...overrides,
  }
}

export function createOrgInvoice(overrides: Partial<OrgInvoice> = {}): OrgInvoice {
  return {
    id: 'invoice-1',
    orgId: 'org-1',
    stripeInvoiceId: 'in_test',
    amountCents: 49900,
    currency: 'eur',
    description: 'PointFinder club, 2026/27 season',
    status: 'open',
    hostedInvoiceUrl: 'https://invoice.example/hosted',
    invoicePdf: 'https://invoice.example/pdf',
    dueAt: '2026-10-09T00:00:00Z',
    paidAt: null,
    termMonths: 12,
    createdAt: '2026-09-09T00:00:00Z',
    ...overrides,
  }
}

const ADMIN_USER: AdminUser = {
  id: 'user-1',
  name: 'Test Operator',
  email: 'test@example.com',
  role: 'operator',
  subscriptionTier: 'free',
  subscriptionStatus: 'active',
  createdAt: '2026-01-01T00:00:00Z',
}

let users: AdminUser[] = [ADMIN_USER]
let orgs: AdminOrg[] = [createAdminOrg()]
let orgTotal = 1
let userTotal = 1
let orgDetail: AdminOrgDetail = createAdminOrgDetail()
let invoices: OrgInvoice[] = []
let clubCreations: CreateClubRequest[] = []
let clubUpdates: { orgId: string; body: UpdateClubRequest }[] = []
let transfers: { orgId: string; userId: string }[] = []
let issuedInvoices: { orgId: string; body: IssueInvoiceRequest }[] = []
let listQueries: { path: 'users' | 'orgs'; page: string | null; size: string | null; search: string | null }[] = []
let createResult: { adminUserId: string | null; inviteId: string | null } = {
  adminUserId: 'user-9',
  inviteId: null,
}
let invoiceFailure: { status: number; code: string } | null = null

/** In-memory stand-in for the admin club endpoints. */
export const adminStore = {
  reset(): void {
    users = [ADMIN_USER]
    orgs = [createAdminOrg()]
    orgTotal = 1
    userTotal = 1
    orgDetail = createAdminOrgDetail()
    invoices = []
    clubCreations = []
    clubUpdates = []
    transfers = []
    issuedInvoices = []
    listQueries = []
    createResult = { adminUserId: 'user-9', inviteId: null }
    invoiceFailure = null
  },
  seedUsers(next: AdminUser[], total = next.length): void {
    users = next
    userTotal = total
  },
  seedOrgs(next: AdminOrg[], total = next.length): void {
    orgs = next
    orgTotal = total
  },
  seedOrgDetail(next: AdminOrgDetail): void {
    orgDetail = next
  },
  seedInvoices(next: OrgInvoice[]): void {
    invoices = next
  },
  /** Answer the next club creation as an invite rather than an attached admin. */
  seedCreateInvites(inviteId = 'invite-9'): void {
    createResult = { adminUserId: null, inviteId }
  },
  /** Make the next issue-invoice call fail with a backend error code. */
  failNextInvoice(code: string, status = 400): void {
    invoiceFailure = { status, code }
  },
  clubCreations: () => clubCreations.map((entry) => ({ ...entry })),
  clubUpdates: () => clubUpdates.map((entry) => ({ ...entry })),
  transfers: () => transfers.map((entry) => ({ ...entry })),
  issuedInvoices: () => issuedInvoices.map((entry) => ({ ...entry })),
  listQueries: () => listQueries.map((entry) => ({ ...entry })),
}

function recordQuery(path: 'users' | 'orgs', url: URL) {
  listQueries.push({
    path,
    page: url.searchParams.get('page'),
    size: url.searchParams.get('size'),
    search: url.searchParams.get('search'),
  })
}

export const adminHandlers = [
  http.get('/api/admin/users', ({ request }) => {
    recordQuery('users', new URL(request.url))
    return HttpResponse.json({ content: users, totalElements: userTotal })
  }),

  http.get('/api/admin/orgs', ({ request }) => {
    recordQuery('orgs', new URL(request.url))
    return HttpResponse.json({ content: orgs, totalElements: orgTotal })
  }),

  http.get('/api/admin/orgs/:orgId', () => HttpResponse.json(orgDetail)),
  http.get('/api/admin/orgs/:orgId/games', () => HttpResponse.json([])),
  http.get('/api/admin/orgs/:orgId/invoices', () => HttpResponse.json(invoices)),

  http.post('/api/admin/orgs', async ({ request }) => {
    const body = (await request.json()) as CreateClubRequest
    clubCreations.push(body)
    const org = {
      id: 'org-new',
      name: body.name,
      slug: 'new-club',
      createdBy: 'admin-1',
      subscriptionTier: 'club' as const,
      subscriptionStatus: 'active' as const,
      memberCount: 1,
      quotaOverrides: body.quotaOverrides ?? null,
      termEnd: body.termEnd ?? null,
      createdAt: '2026-09-09T00:00:00Z',
    }
    return HttpResponse.json(
      { org, adminEmail: body.adminEmail, ...createResult },
      { status: 201 },
    )
  }),

  http.patch('/api/admin/orgs/:orgId', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown> & UpdateClubRequest
    clubUpdates.push({ orgId: params.orgId as string, body })
    // The backend distinguishes an absent key from an explicit null on the
    // three clearable fields: omitting `termEnd` leaves the term alone, while
    // sending `"termEnd": null` clears it. `in` is what says that, so the mock
    // and AdminOrgService.updateOrg answer a save the same way.
    const present = (key: keyof UpdateClubRequest) => key in body
    orgDetail = {
      ...orgDetail,
      name: body.name ?? orgDetail.name,
      subscriptionTier: body.tier ?? orgDetail.subscriptionTier,
      subscriptionStatus: body.status ?? orgDetail.subscriptionStatus,
      termEnd: present('termEnd') ? (body.termEnd ?? null) : orgDetail.termEnd,
      gracePeriodEnd: present('gracePeriodEnd')
        ? (body.gracePeriodEnd ?? null)
        : orgDetail.gracePeriodEnd,
      adminNote: present('adminNote') ? (body.adminNote ?? null) : orgDetail.adminNote,
      quotaOverrides: present('quotaOverrides')
        ? ((body.quotaOverrides ?? null) as AdminOrgDetail['quotaOverrides'])
        : orgDetail.quotaOverrides,
    }
    return HttpResponse.json({
      id: orgDetail.id,
      name: orgDetail.name,
      slug: orgDetail.slug,
      createdBy: orgDetail.createdBy,
      subscriptionTier: orgDetail.subscriptionTier,
      subscriptionStatus: orgDetail.subscriptionStatus,
      memberCount: orgDetail.memberCount,
      quotaOverrides: orgDetail.quotaOverrides,
      termEnd: orgDetail.termEnd,
      createdAt: orgDetail.createdAt,
    })
  }),

  http.post('/api/admin/orgs/:orgId/transfer-ownership', async ({ params, request }) => {
    const body = (await request.json()) as { userId: string }
    transfers.push({ orgId: params.orgId as string, userId: body.userId })
    orgDetail = { ...orgDetail, createdBy: body.userId }
    return HttpResponse.json({ ...orgDetail, quotaOverrides: orgDetail.quotaOverrides })
  }),

  http.post('/api/admin/orgs/:orgId/invoices', async ({ params, request }) => {
    const body = (await request.json()) as IssueInvoiceRequest
    if (invoiceFailure) {
      const failure = invoiceFailure
      invoiceFailure = null
      return HttpResponse.json(
        { code: failure.code, message: failure.code },
        { status: failure.status },
      )
    }
    issuedInvoices.push({ orgId: params.orgId as string, body })
    const invoice = createOrgInvoice({
      id: `invoice-${invoices.length + 1}`,
      amountCents: body.amountCents,
      currency: body.currency ?? 'eur',
      description: body.description,
      termMonths: body.termMonths ?? 12,
    })
    invoices = [invoice, ...invoices]
    return HttpResponse.json(invoice, { status: 201 })
  }),
]
