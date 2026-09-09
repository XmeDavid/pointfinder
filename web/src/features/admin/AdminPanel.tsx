import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api/admin'
import { AdminUserDetail } from './AdminUserDetail'
import { AdminOrgDetail } from './AdminOrgDetail'
import { NewClubDialog } from './NewClubDialog'
import type { AdminUser, AdminOrg } from '@/types/admin'
import { StatusBadge, type StatusBadgeTone } from '@/components/status'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/feedback/LoadingState'
import { EmptyState } from '@/components/feedback/EmptyState'
import { formatClubDate } from '@/lib/clubBilling'

type Tab = 'users' | 'orgs'
type Detail = { type: 'user'; id: string } | { type: 'org'; id: string } | null

const PAGE_SIZE = 50

const TIER_TONES: Record<string, StatusBadgeTone> = {
  free: 'muted',
  pro: 'info',
  club: 'override',
}

const STATUS_TONES: Record<string, StatusBadgeTone> = {
  active: 'success',
  past_due: 'warning',
  grace_period: 'warning',
  frozen: 'destructive',
  cancelled: 'muted',
}

function AdminBadge({ value, toneMap }: { value: string; toneMap: Record<string, StatusBadgeTone> }) {
  return <StatusBadge tone={toneMap[value] ?? 'muted'} label={value} />
}

/**
 * Prev/next over a page of 50. The list endpoints report `totalElements`, so
 * the page can say where it is without fetching what it is not showing.
 */
function Pagination({
  page,
  count,
  total,
  onChange,
  testId,
}: {
  page: number
  count: number
  total: number
  onChange: (next: number) => void
  testId: string
}) {
  const { t } = useTranslation()
  if (total === 0) return null
  const from = page * PAGE_SIZE + 1
  const to = page * PAGE_SIZE + count
  const hasNext = to < total

  return (
    <div className="mt-4 flex items-center gap-3" data-testid={testId}>
      <Button
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        data-testid={`${testId}-prev`}
      >
        {t('admin.previousPage', 'Previous')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!hasNext}
        onClick={() => onChange(page + 1)}
        data-testid={`${testId}-next`}
      >
        {t('admin.nextPage', 'Next')}
      </Button>
      <p className="text-xs text-muted-foreground" data-testid={`${testId}-range`}>
        {t('admin.pageRange', { from, to, total })}
      </p>
    </div>
  )
}

export function AdminPanel() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>('users')
  const [userSearch, setUserSearch] = useState('')
  const [orgSearch, setOrgSearch] = useState('')
  const [userPage, setUserPage] = useState(0)
  const [orgPage, setOrgPage] = useState(0)
  const [detail, setDetail] = useState<Detail>(null)
  const [creatingClub, setCreatingClub] = useState(false)

  const { data: usersPage, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users', userSearch, userPage],
    queryFn: () => adminApi.listUsers({ search: userSearch, page: userPage, size: PAGE_SIZE }),
    enabled: tab === 'users',
  })

  const { data: orgsPage, isLoading: orgsLoading } = useQuery({
    queryKey: ['admin', 'orgs', orgSearch, orgPage],
    queryFn: () => adminApi.listOrgs({ search: orgSearch, page: orgPage, size: PAGE_SIZE }),
    enabled: tab === 'orgs',
  })

  const handleBack = useCallback(() => setDetail(null), [])

  return (
    <div className="h-screen bg-background p-8 overflow-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {t('admin.title', 'Admin Panel')}
      </h1>

      <SurfacePanel padding="lg">
        {detail ? (
          detail.type === 'user' ? (
            <AdminUserDetail userId={detail.id} onBack={handleBack} />
          ) : (
            <AdminOrgDetail orgId={detail.id} onBack={handleBack} />
          )
        ) : (
          <>
            {/* Tabs */}
            <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="mb-6">
              <TabsList>
                <TabsTrigger value="users">{t('admin.users', 'Users')}</TabsTrigger>
                <TabsTrigger value="orgs">{t('admin.organizations', 'Organizations')}</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Users tab */}
            {tab === 'users' && (
              <div>
                <Input
                  type="text"
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setUserPage(0) }}
                  placeholder={t('admin.searchUsers', 'Search by name or email...')}
                  className="mb-4 max-w-sm"
                />
                {usersLoading && <LoadingState label={t('common.loading', 'Loading')} />}
                {!usersLoading && usersPage?.content.length === 0 && (
                  <EmptyState density="compact" title={t('admin.noUsers', 'No users found')} />
                )}
                {!usersLoading && usersPage && usersPage.content.length > 0 && (
                  <ul className="space-y-2">
                    {usersPage.content.map((u: AdminUser) => (
                      <li
                        key={u.id}
                        onClick={() => setDetail({ type: 'user', id: u.id })}
                        className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <AdminBadge value={u.subscriptionTier} toneMap={TIER_TONES} />
                          <AdminBadge value={u.subscriptionStatus} toneMap={STATUS_TONES} />
                          <span className="text-xs text-muted-foreground">→</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {usersPage && (
                  <Pagination
                    page={userPage}
                    count={usersPage.content.length}
                    total={usersPage.totalElements}
                    onChange={setUserPage}
                    testId="admin-users-pagination"
                  />
                )}
              </div>
            )}

            {/* Orgs tab */}
            {tab === 'orgs' && (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <Input
                    type="text"
                    value={orgSearch}
                    onChange={e => { setOrgSearch(e.target.value); setOrgPage(0) }}
                    placeholder={t('admin.searchOrgs', 'Search by name...')}
                    className="max-w-sm"
                  />
                  <Button onClick={() => setCreatingClub(true)} data-testid="admin-new-club">
                    {t('admin.club.newAction')}
                  </Button>
                </div>
                {orgsLoading && <LoadingState label={t('common.loading', 'Loading')} />}
                {!orgsLoading && orgsPage?.content.length === 0 && (
                  <EmptyState density="compact" title={t('admin.noOrgs', 'No organizations found')} />
                )}
                {!orgsLoading && orgsPage && orgsPage.content.length > 0 && (
                  <ul className="space-y-2">
                    {orgsPage.content.map((o: AdminOrg) => (
                      <li
                        key={o.id}
                        onClick={() => setDetail({ type: 'org', id: o.id })}
                        className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{o.name}</p>
                          <p className="text-xs text-muted-foreground">
                            /{o.slug} · {o.memberCount} {o.memberCount === 1 ? t('admin.member', 'member') : t('admin.members', 'members')}
                            {o.termEnd && ` · ${t('club.paidUntil', { date: formatClubDate(o.termEnd, i18n.language) })}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <AdminBadge value={o.subscriptionTier} toneMap={TIER_TONES} />
                          <AdminBadge value={o.subscriptionStatus} toneMap={STATUS_TONES} />
                          <span className="text-xs text-muted-foreground">→</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {orgsPage && (
                  <Pagination
                    page={orgPage}
                    count={orgsPage.content.length}
                    total={orgsPage.totalElements}
                    onChange={setOrgPage}
                    testId="admin-orgs-pagination"
                  />
                )}
              </div>
            )}
          </>
        )}
      </SurfacePanel>

      <NewClubDialog
        open={creatingClub}
        onClose={() => setCreatingClub(false)}
        onCreated={(orgId) => {
          setCreatingClub(false)
          setDetail({ type: 'org', id: orgId })
        }}
      />
    </div>
  )
}
