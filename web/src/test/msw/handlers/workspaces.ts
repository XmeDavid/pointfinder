import { http, HttpResponse } from 'msw'
import type { QuotaResponse } from '@/types/billing'
import type { OrgWorkspace, Workspace } from '@/types/organization'

const emptyLimits = {
  maxActiveGames: 1,
  maxOperatorsPerGame: 1,
  maxBasesPerGame: 5,
  maxFileSizeBytes: 5 * 1024 * 1024,
  maxMembers: null,
  maxLiveGames: null,
  maxPlayersPerGame: null,
  maxResourceStorageBytes: null,
  locationCheckIn: false,
}

const emptyUsage = {
  currentActiveGames: 0,
  currentMembers: null,
  currentLiveGames: null,
  currentResourceStorageBytes: null,
}

export function createOrgWorkspace(overrides: Partial<OrgWorkspace> = {}): OrgWorkspace {
  return {
    id: 'org-1',
    name: 'Scout Group 42',
    slug: 'scout-group-42',
    tier: 'club',
    status: 'active',
    memberCount: 4,
    liveGames: 0,
    termEnd: '2027-07-31T00:00:00Z',
    // OPERATE_GAMES | CREATE_GAMES only: no billing, no permission management.
    permissions: 3,
    ...overrides,
  }
}

export function createQuota(overrides: Partial<QuotaResponse> = {}): QuotaResponse {
  return {
    context: 'personal',
    orgId: null,
    tier: 'free',
    limits: { ...emptyLimits },
    usage: { ...emptyUsage },
    overrides: null,
    ...overrides,
  }
}

let workspace: Workspace = {
  personal: { tier: 'free', status: 'active', activeGames: 0 },
  organizations: [],
}
let personalQuota: QuotaResponse = createQuota()
let orgQuota: QuotaResponse = createQuota({ context: 'org', orgId: 'org-1', tier: 'club' })

export const workspacesStore = {
  reset(): void {
    workspace = { personal: { tier: 'free', status: 'active', activeGames: 0 }, organizations: [] }
    personalQuota = createQuota()
    orgQuota = createQuota({ context: 'org', orgId: 'org-1', tier: 'club' })
  },
  seed(next: Workspace): void {
    workspace = next
  },
  seedOrganizations(orgs: OrgWorkspace[]): void {
    workspace = { ...workspace, organizations: orgs }
  },
  seedPersonalQuota(next: QuotaResponse): void {
    personalQuota = next
  },
  seedOrgQuota(next: QuotaResponse): void {
    orgQuota = next
  },
}

export const workspacesHandlers = [
  http.get('/api/workspaces', () => HttpResponse.json(workspace)),
  http.get('/api/quota/personal', () => HttpResponse.json(personalQuota)),
  http.get('/api/quota/org/:orgId', () => HttpResponse.json(orgQuota)),
]
