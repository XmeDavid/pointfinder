import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api/admin'
import { Spinner } from '@/components/feedback/Spinner'
import { AdminUserDetail } from './AdminUserDetail'
import { AdminOrgDetail } from './AdminOrgDetail'
import type { AdminUser, AdminOrg } from '@/types/admin'

type Tab = 'users' | 'orgs'
type Detail = { type: 'user'; id: string } | { type: 'org'; id: string } | null

const TIER_COLORS: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  pro: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  base: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  high: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  past_due: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  grace_period: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  frozen: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
}

function Badge({ value, colorMap }: { value: string; colorMap: Record<string, string> }) {
  const cls = colorMap[value] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {value}
    </span>
  )
}

export function AdminPanel() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('users')
  const [userSearch, setUserSearch] = useState('')
  const [orgSearch, setOrgSearch] = useState('')
  const [detail, setDetail] = useState<Detail>(null)

  const { data: usersPage, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users', userSearch],
    queryFn: () => adminApi.listUsers({ search: userSearch, size: 50 }),
    enabled: tab === 'users',
  })

  const { data: orgsPage, isLoading: orgsLoading } = useQuery({
    queryKey: ['admin', 'orgs', orgSearch],
    queryFn: () => adminApi.listOrgs({ search: orgSearch, size: 50 }),
    enabled: tab === 'orgs',
  })

  const handleBack = useCallback(() => setDetail(null), [])

  return (
    <div className="h-screen bg-background p-8 overflow-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {t('admin.title', 'Admin Panel')}
      </h1>

      <div className="rounded-xl border border-border bg-card p-6">
        {detail ? (
          detail.type === 'user' ? (
            <AdminUserDetail userId={detail.id} onBack={handleBack} />
          ) : (
            <AdminOrgDetail orgId={detail.id} onBack={handleBack} />
          )
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-border">
              {(['users', 'orgs'] as Tab[]).map(tabKey => (
                <button
                  key={tabKey}
                  onClick={() => setTab(tabKey)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === tabKey
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tabKey === 'users' ? t('admin.users', 'Users') : t('admin.organizations', 'Organizations')}
                </button>
              ))}
            </div>

            {/* Users tab */}
            {tab === 'users' && (
              <div>
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder={t('admin.searchUsers', 'Search by name or email...')}
                  className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
                />
                {usersLoading && <Spinner />}
                {!usersLoading && usersPage?.content.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('admin.noUsers', 'No users found')}</p>
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
                          <Badge value={u.subscriptionTier} colorMap={TIER_COLORS} />
                          <Badge value={u.subscriptionStatus} colorMap={STATUS_COLORS} />
                          <span className="text-xs text-muted-foreground">→</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {usersPage && usersPage.totalElements > usersPage.content.length && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Showing {usersPage.content.length} of {usersPage.totalElements}
                  </p>
                )}
              </div>
            )}

            {/* Orgs tab */}
            {tab === 'orgs' && (
              <div>
                <input
                  type="text"
                  value={orgSearch}
                  onChange={e => setOrgSearch(e.target.value)}
                  placeholder={t('admin.searchOrgs', 'Search by name...')}
                  className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
                />
                {orgsLoading && <Spinner />}
                {!orgsLoading && orgsPage?.content.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('admin.noOrgs', 'No organizations found')}</p>
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
                          <p className="text-xs text-muted-foreground">/{o.slug} · {o.memberCount} {o.memberCount === 1 ? t('admin.member', 'member') : t('admin.members', 'members')}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <Badge value={o.subscriptionTier} colorMap={TIER_COLORS} />
                          <Badge value={o.subscriptionStatus} colorMap={STATUS_COLORS} />
                          <span className="text-xs text-muted-foreground">→</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {orgsPage && orgsPage.totalElements > orgsPage.content.length && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Showing {orgsPage.content.length} of {orgsPage.totalElements}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
