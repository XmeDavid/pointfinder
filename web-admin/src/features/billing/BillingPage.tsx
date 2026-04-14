import { useTranslation } from 'react-i18next'
import { useWorkspaceContext } from '../../stores/workspaceContext'
import { useQuota } from '../../hooks/queries/useQuota'
import { useBillingStatus } from '../../hooks/queries/useBillingStatus'
import { useCreateCheckout, useCreatePortal, useCreateOrgPortal } from '../../hooks/mutations/useBillingMutations'

function formatSize(bytes: number): string {
  if (bytes === 0) return '0'
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function QuotaRow({ label, current, max, formatBytes }: {
  label: string
  current?: number | null
  max?: number | null
  formatBytes?: boolean
}) {
  const fmt = (v: number | null | undefined) => {
    if (v == null) return '∞'
    if (formatBytes) return formatSize(v)
    return String(v)
  }
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">
        {current != null ? `${fmt(current)} / ${fmt(max)}` : fmt(max)}
      </span>
    </div>
  )
}

export function BillingPage() {
  const { t } = useTranslation()
  const { active } = useWorkspaceContext()
  const { data: quota } = useQuota()
  const { data: billingStatus } = useBillingStatus()
  const checkout = useCreateCheckout()
  const portal = useCreatePortal()
  const orgPortal = useCreateOrgPortal()

  const isOrg = active.type === 'org'
  const tier = quota?.tier ?? 'free'
  const isPaying = tier !== 'free'
  const isClubOrg = isOrg && tier === 'base'
  const isHighOrg = isOrg && tier === 'high'
  const isProPersonal = !isOrg && tier === 'pro'
  const showUpgradeSection = !isPaying || isClubOrg

  return (
    <div className="h-screen bg-background p-8 overflow-auto">
      <h1 className="text-2xl font-bold text-foreground mb-2">
        {t('billing.title', 'Billing & Plan')}
      </h1>
      <p className="text-muted-foreground mb-8">
        {isOrg
          ? active.orgName
          : t('billing.personal', 'Personal workspace')}
      </p>

      <div className="rounded-xl border border-border p-6 mb-8 max-w-md">
        <p className="text-sm text-muted-foreground mb-1">
          {t('billing.currentPlan', 'Current plan')}
        </p>
        <p className="text-xl font-semibold text-foreground capitalize">{tier}</p>
        {(isPaying && !isClubOrg) && (
          <button
            onClick={() => isOrg && active.type === 'org'
              ? orgPortal.mutate(active.orgId)
              : portal.mutate()}
            disabled={portal.isPending || orgPortal.isPending}
            className="mt-4 text-sm text-primary hover:underline disabled:opacity-50"
          >
            {t('billing.manageSub', 'Manage subscription')}
          </button>
        )}
      </div>

      {!isOrg && billingStatus && billingStatus.billingCycle && (
        <div className="rounded-xl border border-border p-6 mb-8 max-w-md">
          <p className="text-sm text-muted-foreground mb-1">
            {t('billing.billingPeriod', 'Billing period')}
          </p>
          <p className="text-foreground capitalize">{billingStatus.billingCycle}</p>
          {billingStatus.currentPeriodEnd && (
            <p className="text-sm text-muted-foreground mt-1">
              {t('billing.renewsOn', 'Renews on')}{' '}
              {new Date(billingStatus.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {showUpgradeSection && (
        <div className="space-y-4 max-w-lg">
          <h2 className="text-lg font-semibold text-foreground">
            {t('billing.upgrade', 'Upgrade')}
          </h2>

          {!isOrg && !isProPersonal && (
            <div className="rounded-xl border border-border p-6 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Pro</p>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'billing.proDesc',
                    'Unlimited games, up to 5 operators, unlimited bases',
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">
                  €0.99
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <button
                  onClick={() => checkout.mutate({ plan: 'pro', cycle: 'monthly' })}
                  disabled={checkout.isPending}
                  className="mt-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  {t('billing.subscribe', 'Subscribe')}
                </button>
              </div>
            </div>
          )}

          {isOrg && !isPaying && (
            <div className="rounded-xl border border-border p-6 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{t('billing.clubPlan', 'Club')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('billing.clubDesc', '10 members, 10 live games')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">
                  €25
                  <span className="text-sm font-normal text-muted-foreground">/{t('billing.year', 'yr')}</span>
                </p>
                <button
                  onClick={() =>
                    checkout.mutate({
                      plan: 'org-base',
                      cycle: 'annual',
                      orgId: active.type === 'org' ? active.orgId : undefined,
                    })
                  }
                  disabled={checkout.isPending}
                  className="mt-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  {t('billing.subscribe', 'Subscribe')}
                </button>
              </div>
            </div>
          )}

          {(isOrg && (!isPaying || isClubOrg)) && !isHighOrg && (
            <div className="rounded-xl border border-border p-6 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{t('billing.institutionPlan', 'Institution')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('billing.institutionDesc', '25 members, unlimited games')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">
                  €99.99
                  <span className="text-sm font-normal text-muted-foreground">/{t('billing.year', 'yr')}</span>
                </p>
                <button
                  onClick={() =>
                    checkout.mutate({
                      plan: 'org-high',
                      cycle: 'annual',
                      orgId: active.type === 'org' ? active.orgId : undefined,
                    })
                  }
                  disabled={checkout.isPending}
                  className="mt-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  {isClubOrg
                    ? t('billing.upgradeToInstitution', 'Upgrade to Institution')
                    : t('billing.subscribe', 'Subscribe')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(isHighOrg || isProPersonal) && (
        <div className="rounded-xl border border-border p-6 mb-8 max-w-md">
          <button
            onClick={() => isOrg && active.type === 'org'
              ? orgPortal.mutate(active.orgId)
              : portal.mutate()}
            disabled={portal.isPending || orgPortal.isPending}
            className="text-sm text-primary hover:underline disabled:opacity-50"
          >
            {t('billing.manageSub', 'Manage subscription')}
          </button>
        </div>
      )}

      {quota && (
        <div className="mt-8 max-w-md">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {t('billing.usage', 'Usage & Limits')}
          </h2>
          <div className="space-y-2 text-sm">
            <QuotaRow label={t('billing.activeGames', 'Active games')}
              current={quota.usage.currentActiveGames}
              max={quota.limits.maxActiveGames} />
            {quota.usage.currentMembers != null && (
              <QuotaRow label={t('billing.members', 'Members')}
                current={quota.usage.currentMembers}
                max={quota.limits.maxMembers} />
            )}
            {quota.usage.currentLiveGames != null && (
              <QuotaRow label={t('billing.liveGames', 'Live games')}
                current={quota.usage.currentLiveGames}
                max={quota.limits.maxLiveGames} />
            )}
            <QuotaRow label={t('billing.operatorsPerGame', 'Operators per game')}
              max={quota.limits.maxOperatorsPerGame} />
            <QuotaRow label={t('billing.basesPerGame', 'Bases per game')}
              max={quota.limits.maxBasesPerGame} />
            {quota.limits.maxPlayersPerGame !== undefined && (
              <QuotaRow label={t('billing.playersPerGame', 'Players per game')}
                max={quota.limits.maxPlayersPerGame} />
            )}
            <QuotaRow label={t('billing.maxFileSize', 'Max file size')}
              max={quota.limits.maxFileSizeBytes}
              formatBytes />
            {quota.limits.maxResourceStorageBytes != null && (
              <QuotaRow label={t('billing.resourceStorage', 'Resource storage')}
                current={quota.usage.currentResourceStorageBytes}
                max={quota.limits.maxResourceStorageBytes}
                formatBytes />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
