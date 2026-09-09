import { http, HttpResponse } from 'msw'
import type { OrgInvite, OrgMember, Organization } from '@/types/organization'
import type { OrgInvoice } from '@/types/billing'

export function createOrgMember(overrides: Partial<OrgMember> = {}): OrgMember {
  return {
    id: 'member-1',
    userId: 'user-1',
    name: 'Test Operator',
    email: 'test@example.com',
    permissions: 127,
    joinedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function createOrgInvite(overrides: Partial<OrgInvite> = {}): OrgInvite {
  return {
    id: 'invite-1',
    orgId: 'org-1',
    orgName: 'Scout Group 42',
    email: 'new@example.com',
    status: 'pending',
    invitedBy: 'user-1',
    inviterName: 'Test Operator',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function createOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Scout Group 42',
    slug: 'scout-group-42',
    createdBy: 'user-1',
    subscriptionTier: 'club',
    subscriptionStatus: 'active',
    memberCount: 4,
    quotaOverrides: null,
    termEnd: '2027-07-31T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

let organization: Organization = createOrganization()
let members: OrgMember[] = [createOrgMember()]
let invites: OrgInvite[] = []
let renames: { orgId: string; name: string }[] = []
let deletions: string[] = []
let departures: string[] = []
let transfers: { orgId: string; userId: string }[] = []
let accepts: string[] = []
let declines: string[] = []
let invoices: OrgInvoice[] = []
let failNextWrite = false

export const orgsStore = {
  reset(): void {
    organization = createOrganization()
    members = [createOrgMember()]
    invites = []
    renames = []
    deletions = []
    departures = []
    transfers = []
    accepts = []
    declines = []
    invoices = []
    failNextWrite = false
  },
  seedOrganization(overrides: Partial<Organization>): void {
    organization = createOrganization(overrides)
  },
  seedMembers(next: OrgMember[]): void {
    members = next
  },
  seedInvites(next: OrgInvite[]): void {
    invites = next
  },
  seedInvoices(next: OrgInvoice[]): void {
    invoices = next
  },
  /** Make the next rename or delete answer 500, for error-state coverage. */
  failNextWrite(): void {
    failNextWrite = true
  },
  renames(): { orgId: string; name: string }[] {
    return renames.map((entry) => ({ ...entry }))
  },
  deletions(): string[] {
    return [...deletions]
  },
  /** Clubs the caller removed themself from, in order. */
  departures(): string[] {
    return [...departures]
  },
  transfers(): { orgId: string; userId: string }[] {
    return transfers.map((entry) => ({ ...entry }))
  },
  /** Invites the caller took up, in order. */
  accepts(): string[] {
    return [...accepts]
  },
  /** Invites the caller turned down, in order. */
  declines(): string[] {
    return [...declines]
  },
}

function takeFailure(): boolean {
  if (!failNextWrite) return false
  failNextWrite = false
  return true
}

export const orgsHandlers = [
  http.get('/api/orgs/:orgId', () => HttpResponse.json(organization)),
  http.get('/api/orgs/:orgId/members', () => HttpResponse.json(members)),
  http.get('/api/orgs/:orgId/invites', () => HttpResponse.json(invites)),
  http.get('/api/org-invites/my', () => HttpResponse.json([])),
  http.get('/api/orgs/:orgId/invoices', () => HttpResponse.json(invoices)),

  http.post('/api/orgs/:orgId/leave', ({ params }) => {
    if (takeFailure()) return new HttpResponse(null, { status: 500 })
    departures.push(params.orgId as string)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/orgs/:orgId/transfer-ownership', async ({ params, request }) => {
    if (takeFailure()) return new HttpResponse(null, { status: 500 })
    const body = (await request.json()) as { userId: string }
    transfers.push({ orgId: params.orgId as string, userId: body.userId })
    organization = { ...organization, createdBy: body.userId }
    return HttpResponse.json(organization)
  }),

  http.post('/api/org-invites/:inviteId/accept', ({ params }) => {
    if (takeFailure()) return new HttpResponse(null, { status: 500 })
    accepts.push(params.inviteId as string)
    return HttpResponse.json(createOrgMember())
  }),

  http.post('/api/org-invites/:inviteId/decline', ({ params }) => {
    if (takeFailure()) return new HttpResponse(null, { status: 500 })
    declines.push(params.inviteId as string)
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch('/api/orgs/:orgId', async ({ params, request }) => {
    if (takeFailure()) return new HttpResponse(null, { status: 500 })
    const body = (await request.json()) as { name?: string }
    const orgId = params.orgId as string
    renames.push({ orgId, name: body.name ?? '' })
    organization = { ...organization, id: orgId, name: body.name ?? '' }
    return HttpResponse.json(organization)
  }),

  http.delete('/api/orgs/:orgId', ({ params }) => {
    if (takeFailure()) return new HttpResponse(null, { status: 500 })
    deletions.push(params.orgId as string)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('/api/orgs/:orgId/members/:userId', () => new HttpResponse(null, { status: 204 })),
  http.delete('/api/orgs/:orgId/invites/:inviteId', () => new HttpResponse(null, { status: 204 })),

  http.post('/api/orgs/:orgId/invites', async ({ request }) => {
    const body = (await request.json()) as { email: string }
    return HttpResponse.json(createOrgInvite({ email: body.email }))
  }),

  http.patch('/api/orgs/:orgId/members/:userId/permissions', async ({ params, request }) => {
    const body = (await request.json()) as { permissions: number }
    return HttpResponse.json(
      createOrgMember({ userId: params.userId as string, permissions: body.permissions }),
    )
  }),
]
