import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/errors'
import { formatClubDate, fromDateInputValue, toDateInputValue } from '@/lib/clubBilling'
import { Spinner } from '@/components/feedback/Spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormLabel } from '@/components/ui/form-label'
import { Collapsible } from '@/components/ui/collapsible'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { ResultsStat, ResultsSummary } from '@/components/results/ResultsSummary'
import { EmptyState } from '@/components/feedback/EmptyState'
import { StatusBadge } from '@/components/status'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { OrgInvoiceList } from '@/components/billing/OrgInvoiceList'
import { IssueInvoiceDialog } from './IssueInvoiceDialog'
import { ClubLimitsFields } from './ClubLimitsFields'
import {
  invalidLimitKeys,
  limitsFromOverrides,
  limitsToOverrides,
  unmanagedOverrides,
  type LimitState,
} from './clubLimits'
import type { AdminOrgDetail as AdminOrgDetailModel, UpdateClubRequest } from '@/types/admin'
import type { OrgTier, SubscriptionStatus } from '@/types/organization'

const ORG_TIERS: OrgTier[] = ['free', 'club']
const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'active',
  'past_due',
  'grace_period',
  'frozen',
  'cancelled',
]

interface Props {
  orgId: string
  onBack: () => void
}

interface FormState {
  name: string
  tier: OrgTier
  status: SubscriptionStatus
  termEnd: string
  adminNote: string
  limits: LimitState
}

function formFrom(org: AdminOrgDetailModel): FormState {
  return {
    name: org.name,
    tier: org.subscriptionTier,
    status: org.subscriptionStatus,
    termEnd: toDateInputValue(org.termEnd),
    adminNote: org.adminNote ?? '',
    limits: limitsFromOverrides(org.quotaOverrides),
  }
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

  const { data: invoices } = useQuery({
    queryKey: ['admin', 'org', orgId, 'invoices'],
    queryFn: () => adminApi.listOrgInvoices(orgId),
    enabled: !!org,
  })

  const [form, setForm] = useState<FormState | null>(null)
  const [saved, setSaved] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [transferTarget, setTransferTarget] = useState('')
  const [confirmingTransfer, setConfirmingTransfer] = useState(false)

  // Seed the form the first time the club arrives, then leave it to the admin.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  if (org && loadedFor !== org.id) {
    setForm(formFrom(org))
    setLoadedFor(org.id)
  }

  const save = useMutation({
    mutationFn: (data: UpdateClubRequest) => adminApi.updateClub(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'org', orgId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const transfer = useMutation({
    mutationFn: (userId: string) => adminApi.transferOrgOwnership(orgId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'org', orgId] })
      setConfirmingTransfer(false)
      setTransferTarget('')
    },
  })

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  if (isLoading) return <div className="p-6"><Spinner /></div>
  if (!org || !form) return null

  const invalid = invalidLimitKeys(form.limits)
  // Per-deal keys outside the club shape survive a save untouched.
  const extraOverrides = unmanagedOverrides(org.quotaOverrides)
  const resolvedOverrides = { ...extraOverrides, ...limitsToOverrides(form.limits) }
  const canSave = form.name.trim().length >= 2 && invalid.length === 0 && !save.isPending

  const handleSave = () => {
    if (!canSave) return
    save.mutate({
      name: form.name.trim(),
      tier: form.tier,
      status: form.status,
      termEnd: fromDateInputValue(form.termEnd),
      quotaOverrides: resolvedOverrides,
      adminNote: form.adminNote.trim() || null,
    })
  }

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch })

  const transferTargetName = org.members.find((m) => m.userId === transferTarget)?.name ?? ''
  const transferCandidates = org.members.filter((m) => m.userId !== org.createdBy)

  return (
    <div>
      <Button onClick={onBack} variant="ghost" className="mb-6">
        ← {t('common.back', 'Back')}
      </Button>

      <div className="mb-1 flex items-center gap-3">
        <h2 className="text-xl font-bold text-foreground">{org.name}</h2>
        <StatusBadge
          tone={org.subscriptionStatus === 'active' ? 'success' : org.subscriptionStatus === 'frozen' ? 'destructive' : 'warning'}
          label={t(`club.status.${org.subscriptionStatus}`)}
        />
      </div>
      <p className="text-sm text-muted-foreground mb-6" data-testid="admin-org-paid-until">
        /{org.slug}
        {org.termEnd && ` · ${t('club.paidUntil', { date: formatClubDate(org.termEnd, i18n.language) })}`}
      </p>

      <ResultsSummary className="mb-8">
        <ResultsStat label={t('admin.createdBy', 'Created by')} value={org.createdByName} />
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
              <p className="text-muted-foreground">{t('admin.stripeCustomerId')}</p>
              <p className="text-foreground font-mono text-xs">{org.stripeCustomerId}</p>
            </div>
          )}
          {org.gracePeriodEnd && (
            <div>
              <p className="text-muted-foreground">{t('admin.gracePeriodEnd')}</p>
              <p className="text-foreground">{formatClubDate(org.gracePeriodEnd, i18n.language)}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">{t('admin.joined')}</p>
            <p className="text-foreground">{formatClubDate(org.createdAt, i18n.language)}</p>
          </div>
        </div>
      </SurfacePanel>

      {/* The deal */}
      <SurfacePanel padding="lg" className="mb-6">
        <h3 className="font-semibold text-foreground mb-4">{t('admin.club.dealTitle')}</h3>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FormLabel htmlFor="admin-org-name">{t('admin.club.name')}</FormLabel>
              <Input
                id="admin-org-name"
                data-testid="admin-org-name"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                maxLength={100}
              />
            </div>
            <div>
              <FormLabel htmlFor="admin-org-term-end">{t('admin.club.termEnd')}</FormLabel>
              <Input
                id="admin-org-term-end"
                data-testid="admin-org-term-end"
                type="date"
                value={form.termEnd}
                onChange={(e) => set({ termEnd: e.target.value })}
              />
            </div>
            <div>
              <FormLabel htmlFor="admin-org-tier">{t('admin.tier', 'Tier')}</FormLabel>
              <Select
                id="admin-org-tier"
                data-testid="admin-org-tier"
                value={form.tier}
                onChange={(e) => set({ tier: e.target.value as OrgTier })}
              >
                {ORG_TIERS.map((tier) => (
                  <option key={tier} value={tier}>{t(`club.tier.${tier}`)}</option>
                ))}
              </Select>
            </div>
            <div>
              <FormLabel htmlFor="admin-org-status">{t('admin.status', 'Status')}</FormLabel>
              <Select
                id="admin-org-status"
                data-testid="admin-org-status"
                value={form.status}
                onChange={(e) => set({ status: e.target.value as SubscriptionStatus })}
              >
                {SUBSCRIPTION_STATUSES.map((status) => (
                  <option key={status} value={status}>{t(`club.status.${status}`)}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <FormLabel htmlFor="admin-org-note" optional>
              {t('admin.adminNote', 'Admin Note')}
            </FormLabel>
            <Textarea
              id="admin-org-note"
              data-testid="admin-org-note"
              value={form.adminNote}
              onChange={(e) => set({ adminNote: e.target.value })}
              rows={2}
              className="min-h-0"
            />
          </div>

          <section>
            <h4 className="text-sm font-semibold text-foreground mb-3">{t('admin.limits.title')}</h4>
            <ClubLimitsFields
              value={form.limits}
              onChange={(limits) => set({ limits })}
              invalidKeys={invalid}
              disabled={save.isPending}
            />
          </section>

          <Collapsible title={t('admin.club.advancedJson')}>
            <p className="mb-2 text-xs text-muted-foreground">{t('admin.club.advancedJsonHint')}</p>
            <pre
              data-testid="admin-org-overrides-json"
              className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs font-mono text-foreground"
            >
              {JSON.stringify(resolvedOverrides, null, 2)}
            </pre>
          </Collapsible>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={!canSave} loading={save.isPending} data-testid="admin-org-save">
              {save.isPending ? t('common.saving', 'Saving...') : t('common.save')}
            </Button>
            {saved && (
              <span className="text-sm text-success" data-testid="admin-org-saved">
                {t('common.saved')}
              </span>
            )}
            {save.isError && (
              <span className="text-sm text-destructive" role="alert">
                {getApiErrorMessage(save.error, t('common.serverError'))}
              </span>
            )}
          </div>
        </div>
      </SurfacePanel>

      {/* Invoices */}
      <SurfacePanel padding="lg" className="mb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">{t('club.invoices.title')}</h3>
          <Button size="sm" onClick={() => setIssuing(true)} data-testid="admin-org-issue-invoice">
            {t('admin.invoice.issueAction')}
          </Button>
        </div>
        <OrgInvoiceList invoices={invoices ?? []} testId="admin-org-invoices" />
      </SurfacePanel>

      {/* Members and ownership */}
      <SurfacePanel padding="lg" className="mb-6">
        <h3 className="font-semibold text-foreground mb-4">{t('admin.members', 'Members')}</h3>
        {org.members.length === 0 ? (
          <EmptyState density="compact" title={t('admin.noMembers', 'No members')} />
        ) : (
          <ul className="space-y-2">
            {org.members.map(m => (
              <li key={m.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {m.name}
                    {m.userId === org.createdBy && (
                      <span className="ml-2 text-xs text-muted-foreground">{t('club.owner')}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <p className="text-xs text-muted-foreground">{formatClubDate(m.joinedAt, i18n.language)}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 border-t border-border pt-4" data-testid="admin-org-transfer">
          <p className="text-sm font-medium text-foreground">{t('club.transfer.title')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('club.transfer.desc')}</p>
          {transferCandidates.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('club.transfer.noCandidates')}</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
                aria-label={t('club.transfer.pickMember')}
                data-testid="admin-org-transfer-target"
                className="max-w-xs"
              >
                <option value="">{t('club.transfer.pickMember')}</option>
                {transferCandidates.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name} — {m.email}</option>
                ))}
              </Select>
              <Button
                variant="outline"
                disabled={!transferTarget || transfer.isPending}
                onClick={() => setConfirmingTransfer(true)}
                data-testid="admin-org-transfer-btn"
              >
                {t('club.transfer.action')}
              </Button>
            </div>
          )}
          {transfer.isError && (
            <p className="mt-2 text-sm text-destructive" role="alert" data-testid="admin-org-transfer-error">
              {getApiErrorMessage(transfer.error, t('common.serverError'))}
            </p>
          )}
        </div>
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
                <Button onClick={() => navigate(`/game/${g.id}`)} variant="link" size="sm">
                  {t('admin.enterGame', 'Enter game')} →
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SurfacePanel>

      <IssueInvoiceDialog orgId={orgId} open={issuing} onClose={() => setIssuing(false)} />

      <ConfirmDeleteDialog
        open={confirmingTransfer}
        variant="default"
        onConfirm={() => transfer.mutate(transferTarget)}
        onCancel={() => setConfirmingTransfer(false)}
        title={t('club.transfer.title')}
        description={t('club.transfer.confirm', { name: transferTargetName, club: org.name })}
        confirmLabel={t('club.transfer.action')}
      />
    </div>
  )
}
