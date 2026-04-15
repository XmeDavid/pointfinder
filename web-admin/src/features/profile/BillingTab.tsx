import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Download } from 'lucide-react'
import { useWorkspaceContext } from '../../stores/workspaceContext'
import { useQuota } from '../../hooks/queries/useQuota'
import { useBillingStatus } from '../../hooks/queries/useBillingStatus'
import { useCreateCheckout, useCreatePortal, useCreateOrgPortal } from '../../hooks/mutations/useBillingMutations'
import { useInvoices } from '@/hooks/queries/useInvoices'
import type { Invoice } from '@/types/billing'

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

function StatusBadge({ status }: { status: Invoice['status'] }) {
  const { t } = useTranslation()
  const colorMap: Record<Invoice['status'], string> = {
    paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    draft: 'bg-muted text-muted-foreground',
    void: 'bg-muted text-muted-foreground',
    uncollectible: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[status]}`}>
      {t(`billing.invoiceStatus.${status}`, status)}
    </span>
  )
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full px-4 py-3 text-sm flex items-center gap-3 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-muted-foreground w-24 shrink-0">
          {new Date(invoice.date).toLocaleDateString()}
        </span>
        <span className="flex-1 font-medium text-foreground truncate">
          {invoice.planName ?? '—'}
        </span>
        <span className="text-foreground font-medium shrink-0">
          {formatAmount(invoice.amount, invoice.currency)}
        </span>
        <span className="shrink-0">
          <StatusBadge status={invoice.status} />
        </span>
        {invoice.paymentMethodBrand && invoice.paymentMethodLast4 && (
          <span className="text-muted-foreground shrink-0 hidden sm:block">
            {invoice.paymentMethodBrand} ····{invoice.paymentMethodLast4}
          </span>
        )}
        {invoice.pdfUrl && (
          <a
            href={invoice.pdfUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t('billing.downloadPdf', 'Download PDF')}
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4" />
          </a>
        )}
        <span className="text-muted-foreground shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {expanded && (
        <div className="px-4 py-3 border-t border-border bg-muted/30 space-y-3 text-sm">
          {invoice.billingPeriodStart && invoice.billingPeriodEnd && (
            <div>
              <span className="text-muted-foreground">{t('billing.billingPeriodLabel', 'Billing period')}: </span>
              <span className="text-foreground">
                {new Date(invoice.billingPeriodStart).toLocaleDateString()} –{' '}
                {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          )}

          {invoice.lineItems.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1">{t('billing.lineItemsLabel', 'Line items')}</p>
              <div className="space-y-1">
                {invoice.lineItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-foreground">
                      {item.description}
                      {item.quantity > 1 && (
                        <span className="text-muted-foreground"> × {item.quantity}</span>
                      )}
                    </span>
                    <span className="text-foreground">{formatAmount(item.amount, invoice.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invoice.tax > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('billing.tax', 'Tax')}</span>
              <span className="text-foreground">{formatAmount(invoice.tax, invoice.currency)}</span>
            </div>
          )}

          {invoice.refundedAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('billing.refunded', 'Refunded')}</span>
              <span className="text-foreground">−{formatAmount(invoice.refundedAmount, invoice.currency)}</span>
            </div>
          )}

          {invoice.paymentMethodBrand && invoice.paymentMethodLast4 && (
            <div>
              <span className="text-muted-foreground">{t('billing.paymentMethodLabel', 'Payment method')}: </span>
              <span className="text-foreground">
                {invoice.paymentMethodBrand} ····{invoice.paymentMethodLast4}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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

export function BillingTab() {
  const { t } = useTranslation()
  const { active } = useWorkspaceContext()
  const { data: quota } = useQuota()
  const { data: billingStatus } = useBillingStatus()
  const checkout = useCreateCheckout()
  const portal = useCreatePortal()
  const orgPortal = useCreateOrgPortal()

  const invoicesQuery = useInvoices()
  const allInvoices = invoicesQuery.data?.pages.flatMap((p) => p.invoices) ?? []

  const isOrg = active.type === 'org'
  const tier = quota?.tier ?? 'free'
  const isPaying = tier !== 'free'
  const isClubOrg = isOrg && tier === 'base'
  const isHighOrg = isOrg && tier === 'high'
  const isProPersonal = !isOrg && tier === 'pro'
  const showUpgradeSection = !isPaying || isClubOrg

  return (
    <>
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

      <div className="mt-8 max-w-lg">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {t('billing.history', 'Billing History')}
        </h2>

        {invoicesQuery.isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!invoicesQuery.isLoading && allInvoices.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            {t('billing.noInvoices', 'No invoices yet')}
          </p>
        )}

        {allInvoices.length > 0 && (
          <div className="space-y-2">
            {allInvoices.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </div>
        )}

        {invoicesQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => invoicesQuery.fetchNextPage()}
            disabled={invoicesQuery.isFetchingNextPage}
            className="mt-4 text-sm text-primary hover:underline disabled:opacity-50"
          >
            {invoicesQuery.isFetchingNextPage
              ? '…'
              : t('billing.loadMore', 'Load more')}
          </button>
        )}
      </div>
    </>
  )
}
