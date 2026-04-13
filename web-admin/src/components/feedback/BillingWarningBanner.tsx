import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, X } from 'lucide-react'
import { useWorkspaces } from '@/hooks/queries/useWorkspaces'
import { useWorkspaceContext } from '@/stores/workspaceContext'

const BILLING_PATHS = ['/billing', '/billing/success', '/billing/cancel']

export function BillingWarningBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [dismissed, setDismissed] = useState(false)
  const { data: workspaces } = useWorkspaces()
  const { active } = useWorkspaceContext()

  if (dismissed) return null
  if (BILLING_PATHS.some((p) => location.pathname.startsWith(p))) return null

  const status = (() => {
    if (!workspaces) return null
    if (active.type === 'personal') return workspaces.personal.status
    return workspaces.organizations.find((o) => o.id === active.orgId)?.status ?? null
  })()

  if (status !== 'past_due' && status !== 'grace_period') return null

  const message =
    status === 'past_due'
      ? t('billing.paymentFailed', "Payment failed. We're retrying automatically.")
      : t(
          'billing.gracePeriod',
          'Your subscription will be frozen soon. Please update your payment method.',
        )

  return (
    <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5 dark:bg-amber-950/30 dark:border-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">{message}</p>
      <button
        onClick={() => navigate('/billing')}
        className="text-sm font-medium text-amber-700 underline hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 shrink-0"
      >
        {t('billing.resolve', 'Resolve')}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
