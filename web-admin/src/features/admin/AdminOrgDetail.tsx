import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api/admin'
import { Spinner } from '@/components/feedback/Spinner'
import { Button } from '@/components/ui/button'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { ResultsStat, ResultsSummary } from '@/components/results/ResultsSummary'
import { EmptyState } from '@/components/feedback/EmptyState'

const ORG_TIERS = ['free', 'base', 'high']
const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'grace_period', 'frozen', 'cancelled']

interface Props {
  orgId: string
  onBack: () => void
}

export function AdminOrgDetail({ orgId, onBack }: Props) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: org, isLoading } = useQuery({
    queryKey: ['admin', 'org', orgId],
    queryFn: () => adminApi.getOrgDetail(orgId),
  })

  const { data: games } = useQuery({
    queryKey: ['admin', 'org', orgId, 'games'],
    queryFn: () => adminApi.getOrgGames(orgId),
    enabled: !!org,
  })

  const [tier, setTier] = useState('')
  const [status, setStatus] = useState('')
  const [quotaJson, setQuotaJson] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [saved, setSaved] = useState(false)

  const [formInit, setFormInit] = useState(false)
  if (org && !formInit) {
    setTier(org.subscriptionTier)
    setStatus(org.subscriptionStatus)
    setQuotaJson(org.quotaOverrides ? JSON.stringify(org.quotaOverrides, null, 2) : '')
    setAdminNote(org.adminNote ?? '')
    setFormInit(true)
  }

  const override = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      adminApi.overrideOrgSubscription(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'org', orgId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSave = () => {
    setJsonError('')
    let quotaOverrides: Record<string, unknown> | null = null
    if (quotaJson.trim()) {
      try {
        quotaOverrides = JSON.parse(quotaJson)
      } catch {
        setJsonError('Invalid JSON')
        return
      }
    }
    override.mutate({ tier, status, quotaOverrides, adminNote: adminNote || null })
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  if (isLoading) return <div className="p-6"><Spinner /></div>
  if (!org) return null

  return (
    <div>
      <Button
        onClick={onBack}
        variant="ghost"
        className="mb-6"
      >
        ← {t('common.back', 'Back')}
      </Button>

      <h2 className="text-xl font-bold text-foreground mb-1">{org.name}</h2>
      <p className="text-sm text-muted-foreground mb-6">/{org.slug}</p>

      {/* Info row */}
      <ResultsSummary className="mb-8">
        <ResultsStat label="Created by" value={org.createdByName} />
        <ResultsStat label={t('admin.members', 'Members')} value={org.memberCount} />
        <ResultsStat label={t('admin.games', 'Games')} value={org.gameCount} />
        <ResultsStat label={t('admin.storage', 'Storage')} value={formatBytes(org.resourceStorageBytes)} />
      </ResultsSummary>

      {/* Subscription info */}
      <SurfacePanel padding="lg" className="mb-6">
        <h3 className="font-semibold text-foreground mb-4">{t('admin.subscription', 'Subscription')}</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {org.stripeCustomerId && (
            <div>
              <p className="text-muted-foreground">Stripe customer ID</p>
              <p className="text-foreground font-mono text-xs">{org.stripeCustomerId}</p>
            </div>
          )}
          {org.gracePeriodEnd && (
            <div>
              <p className="text-muted-foreground">Grace period end</p>
              <p className="text-foreground">{new Date(org.gracePeriodEnd).toLocaleDateString(i18n.language)}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Joined</p>
            <p className="text-foreground">{new Date(org.createdAt).toLocaleDateString(i18n.language)}</p>
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
                {ORG_TIERS.map(t => (
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
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('admin.quotaOverrides', 'Quota Overrides (JSON)')}
            </label>
            <textarea
              value={quotaJson}
              onChange={e => { setQuotaJson(e.target.value); setJsonError('') }}
              rows={4}
              placeholder="{}"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            {jsonError && <p className="text-xs text-destructive mt-1">{jsonError}</p>}
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
              disabled={override.isPending}
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

      {/* Members list */}
      <SurfacePanel padding="lg" className="mb-6">
        <h3 className="font-semibold text-foreground mb-4">{t('admin.members', 'Members')}</h3>
        {org.members.length === 0 ? (
          <EmptyState density="compact" title={t('admin.noMembers', 'No members')} />
        ) : (
          <ul className="space-y-2">
            {org.members.map(m => (
              <li key={m.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(m.joinedAt).toLocaleDateString(i18n.language)}
                </p>
              </li>
            ))}
          </ul>
        )}
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
