import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { useWorkspaces } from '@/hooks/queries/useWorkspaces'
import { useWorkspaceContext } from '@/stores/workspaceContext'

const BILLING_PATHS = ['/billing', '/billing/success', '/billing/cancel']

export function FrozenBlocker({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: workspaces } = useWorkspaces()
  const { active } = useWorkspaceContext()

  // Don't block on billing pages
  if (BILLING_PATHS.some((p) => location.pathname.startsWith(p))) {
    return <>{children}</>
  }

  const isFrozen = (() => {
    if (!workspaces) return false
    if (active.type === 'personal') {
      return workspaces.personal.status === 'frozen'
    }
    const org = workspaces.organizations.find((o) => o.id === active.orgId)
    return org?.status === 'frozen'
  })()

  if (!isFrozen) return <>{children}</>

  return (
    <div className="relative h-full w-full">
      {/* Dim background content */}
      <div className="pointer-events-none select-none opacity-30 blur-sm">
        {children}
      </div>

      {/* Full-screen overlay */}
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="max-w-sm w-full text-center px-6">
          <div className="flex justify-center mb-4">
            <Lock className="h-12 w-12 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            {t('billing.frozenTitle', 'Account frozen')}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {t(
              'billing.frozenDesc',
              'Your subscription has expired. Please update your payment to restore access.',
            )}
          </p>
          <button
            onClick={() => navigate('/billing')}
            className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {t('billing.resolveBilling', 'Resolve billing')}
          </button>
        </div>
      </div>
    </div>
  )
}
