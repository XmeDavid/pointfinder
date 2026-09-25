import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api/admin'
import type { AdminUserDetail as AdminUserDetailModel } from '@/types/admin'
import { Spinner } from '@/components/feedback/Spinner'
import { Button } from '@/components/ui/button'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { ResultsStat, ResultsSummary } from '@/components/results/ResultsSummary'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ClubLimitsFields } from './ClubLimitsFields'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import {
  PERSONAL_LIMIT_FIELDS,
  invalidLimitKeys,
  limitsFromOverrides,
  limitsToOverrides,
  unmanagedOverrides,
  type LimitState,
} from './clubLimits'

const USER_TIERS = ['free', 'pro']
const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'grace_period', 'frozen', 'cancelled']

interface Props {
  userId: string
  onBack: () => void
}

export function AdminUserDetail({ userId, onBack }: Props) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: user, isLoading } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => adminApi.getUserDetail(userId),
  })

  const { data: games } = useQuery({
    queryKey: ['admin', 'user', userId, 'games'],
    queryFn: () => adminApi.getUserGames(userId),
    enabled: !!user,
  })

  const [tier, setTier] = useState('')
  const [status, setStatus] = useState('')
  const [limits, setLimits] = useState<LimitState>({})
  const [blockReason, setBlockReason] = useState('')
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [saved, setSaved] = useState(false)

  // Initialise form once data loads
  const [formInit, setFormInit] = useState(false)
  if (user && !formInit) {
    setTier(user.subscriptionTier)
    setStatus(user.subscriptionStatus)
    setLimits(limitsFromOverrides(user.quotaOverrides, PERSONAL_LIMIT_FIELDS))
    setAdminNote(user.adminNote ?? '')
    setFormInit(true)
  }

  const override = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      adminApi.overrideUserSubscription(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  // Owner decision 2026-09-24: admins can block abusive accounts.
  const accountChanged = (next: AdminUserDetailModel) => {
    queryClient.setQueryData(['admin', 'user', userId], next)
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'publications'] })
    setBlockReason('')
  }
  const block = useMutation({ mutationFn: (reason: string) => adminApi.blockUser(userId, reason), onSuccess: accountChanged })
  const unblock = useMutation({ mutationFn: () => adminApi.unblockUser(userId), onSuccess: accountChanged })

  // Keys the form cannot show (set by hand before it existed) survive a save.
  const invalidLimits = invalidLimitKeys(limits, PERSONAL_LIMIT_FIELDS)
  const handleSave = () => {
    if (invalidLimits.length > 0) return
    const merged = { ...unmanagedOverrides(user?.quotaOverrides, PERSONAL_LIMIT_FIELDS), ...limitsToOverrides(limits, PERSONAL_LIMIT_FIELDS) }
    override.mutate({ tier, status, quotaOverrides: Object.keys(merged).length ? merged : null, adminNote: adminNote || null })
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  if (isLoading) return <div className="p-6"><Spinner /></div>
  if (!user) return null

  return (
    <div>
      <Button
        onClick={onBack}
        variant="ghost"
        className="mb-6"
      >
        ← {t('common.back', 'Back')}
      </Button>

      <h2 className="text-xl font-bold text-foreground mb-1">{user.name}</h2>
      <p className="text-sm text-muted-foreground mb-6">{user.email}</p>

      {/* Info row */}
      <ResultsSummary className="mb-8">
        <ResultsStat label="Role" value={user.role} />
        <ResultsStat label={t('admin.games', 'Games')} value={user.gameCount} />
        <ResultsStat label={t('admin.organizations', 'Organizations')} value={user.orgCount} />
        <ResultsStat label={t('admin.storage', 'Storage')} value={formatBytes(user.resourceStorageBytes)} />
      </ResultsSummary>

      {/* Subscription section */}
      <SurfacePanel padding="lg" className="mb-6">
        <h3 className="font-semibold text-foreground mb-4">{t('admin.subscription', 'Subscription')}</h3>
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          {user.billingCycle && (
            <div>
              <p className="text-muted-foreground">{t('admin.billingCycle')}</p>
              <p className="text-foreground capitalize">{user.billingCycle}</p>
            </div>
          )}
          {user.currentPeriodEnd && (
            <div>
              <p className="text-muted-foreground">{t('admin.periodEnd')}</p>
              <p className="text-foreground">{new Date(user.currentPeriodEnd).toLocaleDateString(i18n.language)}</p>
            </div>
          )}
          {user.gracePeriodEnd && (
            <div>
              <p className="text-muted-foreground">{t('admin.gracePeriodEnd')}</p>
              <p className="text-foreground">{new Date(user.gracePeriodEnd).toLocaleDateString(i18n.language)}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">{t('admin.joined')}</p>
            <p className="text-foreground">{new Date(user.createdAt).toLocaleDateString(i18n.language)}</p>
          </div>
        </div>
      </SurfacePanel>

      {/* Override form */}
      <SurfacePanel padding="lg" className="mb-6">
        <h3 className="font-semibold text-foreground mb-4">{t('admin.overrides', 'Overrides')}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('admin.tier', 'Tier')}</label>
              <select
                value={tier}
                onChange={e => setTier(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {USER_TIERS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('admin.status', 'Status')}</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {SUBSCRIPTION_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className="block text-sm font-medium text-foreground mb-2">{t('admin.limits.title')}</p>
            <ClubLimitsFields
              value={limits}
              onChange={setLimits}
              invalidKeys={invalidLimits}
              disabled={override.isPending}
              fields={PERSONAL_LIMIT_FIELDS}
              data-testid="user-limits"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('admin.adminNote', 'Admin Note')}
            </label>
            <textarea
              value={adminNote}
              onChange={e => setAdminNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={override.isPending || invalidLimits.length > 0}
              loading={override.isPending}
            >
              {override.isPending ? t('common.saving', 'Saving...') : t('admin.saveOverrides', 'Save Overrides')}
            </Button>
            {saved && (
              <span className="text-sm text-success">{t('admin.overridesSaved', 'Overrides saved')}</span>
            )}
            {override.isError && (
              <span className="text-sm text-destructive">{t('common.serverError', 'An error occurred.')}</span>
            )}
          </div>
        </div>
      </SurfacePanel>

      {/* Account access: blocking (owner decision 2026-09-24) */}
      <SurfacePanel padding="lg" className="mb-6">
        <h3 className="font-semibold text-foreground mb-2">{t('admin.block.title')}</h3>
        {user.role === 'admin' ? (
          <p className="text-sm text-muted-foreground">{t('admin.block.notForAdmins')}</p>
        ) : user.blockedAt ? (
          <div className="space-y-3" data-testid="admin-user-blocked">
            <p className="text-sm text-foreground break-words">
              {t('admin.block.blocked', {
                date: new Date(user.blockedAt).toLocaleDateString(i18n.language),
                reason: user.blockedReason ?? '',
              })}
            </p>
            <p className="text-xs text-muted-foreground">{t('admin.block.unblockHint')}</p>
            <Button variant="outline" className="min-h-11" onClick={() => unblock.mutate()} loading={unblock.isPending} disabled={unblock.isPending}>
              {t('admin.block.unblock')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('admin.block.intro')}</p>
            <div>
              <label htmlFor="admin-block-reason" className="block text-sm font-medium text-foreground mb-1">{t('admin.block.reason')}</label>
              <Textarea
                id="admin-block-reason"
                value={blockReason}
                maxLength={500}
                rows={2}
                onChange={(e) => setBlockReason(e.target.value)}
                disabled={block.isPending}
              />
            </div>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={!blockReason.trim() || block.isPending}
              loading={block.isPending}
              onClick={() => setConfirmBlock(true)}
              data-testid="admin-user-block"
            >
              {t('admin.block.block')}
            </Button>
          </div>
        )}
        {(block.isError || unblock.isError) && (
          <p role="alert" className="mt-2 text-sm text-destructive">{t('admin.block.error')}</p>
        )}
        <ConfirmDeleteDialog
          open={confirmBlock}
          title={t('admin.block.confirmTitle', { name: user.name })}
          description={t('admin.block.confirmDescription')}
          confirmLabel={t('admin.block.block')}
          onCancel={() => setConfirmBlock(false)}
          onConfirm={() => {
            setConfirmBlock(false)
            block.mutate(blockReason.trim())
          }}
        />
      </SurfacePanel>

      {/* Games list */}
      <SurfacePanel padding="lg">
        <h3 className="font-semibold text-foreground mb-4">{t('admin.games', 'Games')}</h3>
        {!games || games.length === 0 ? (
          <EmptyState density="compact" title={t('admin.noGames', 'No games')} />
        ) : (
          <ul className="space-y-2">
            {games.map(g => (
              <li key={g.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{g.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{g.status}</p>
                </div>
                <Button
                  onClick={() => navigate(`/game/${g.id}`)}
                  variant="link"
                  size="sm"
                >
                  {t('admin.enterGame', 'Enter game')} →
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SurfacePanel>
    </div>
  )
}
