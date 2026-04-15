import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/lib/auth/store'
import { cn } from '@/lib/utils'

const TABS = ['general', 'security', 'billing', 'danger-zone'] as const
type Tab = (typeof TABS)[number]

export function ProfilePage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)

  const activeTab = (searchParams.get('tab') as Tab) || 'general'

  const setTab = (tab: Tab) => {
    setSearchParams({ tab }, { replace: true })
  }

  const tabLabels: Record<Tab, string> = {
    general: t('profile.tabs.general', 'General'),
    security: t('profile.tabs.security', 'Security'),
    billing: t('profile.tabs.billing', 'Billing'),
    'danger-zone': t('profile.tabs.dangerZone', 'Danger Zone'),
  }

  return (
    <div className="h-full bg-background overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-foreground">
          {t('profile.title', 'Profile')}
        </h1>
        <p className="text-muted-foreground mt-1 mb-6">{user?.email}</p>

        <div className="flex border-b border-border mb-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                activeTab === tab
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`profile-tab-${tab}`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* Tab content — placeholder until tab components are wired in Task 13 */}
        <div data-testid="profile-tab-content">
          {activeTab === 'general' && (
            <p className="text-muted-foreground">General tab content</p>
          )}
          {activeTab === 'security' && (
            <p className="text-muted-foreground">Security tab content</p>
          )}
          {activeTab === 'billing' && (
            <p className="text-muted-foreground">Billing tab content</p>
          )}
          {activeTab === 'danger-zone' && (
            <p className="text-muted-foreground">Danger zone tab content</p>
          )}
        </div>
      </div>
    </div>
  )
}
