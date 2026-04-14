import { useTranslation } from 'react-i18next'
import { useWorkspaceContext } from '../../stores/workspaceContext'
import { useQuota } from '../../hooks/queries/useQuota'
import { useCreateCheckout, useCreatePortal, useCreateOrgPortal } from '../../hooks/mutations/useBillingMutations'

export function BillingPage() {
  const { t } = useTranslation()
  const { active } = useWorkspaceContext()
  const { data: quota } = useQuota()
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
            {t('billing.usage', 'Usage')}
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('billing.activeGames', 'Active games')}
              </span>
              <span className="text-foreground">
                {quota.usage.currentActiveGames} /{' '}
                {quota.limits.maxActiveGames ?? '∞'}
              </span>
            </div>
            {quota.usage.currentMembers != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('billing.members', 'Members')}
                </span>
                <span className="text-foreground">
                  {quota.usage.currentMembers} /{' '}
                  {quota.limits.maxMembers ?? '∞'}
                </span>
              </div>
            )}
            {quota.usage.currentLiveGames != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('billing.liveGames', 'Live games')}
                </span>
                <span className="text-foreground">
                  {quota.usage.currentLiveGames} /{' '}
                  {quota.limits.maxLiveGames ?? '∞'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
