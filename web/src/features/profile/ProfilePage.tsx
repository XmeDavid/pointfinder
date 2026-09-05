import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/lib/auth/store'
import { GeneralTab } from './GeneralTab'
import { SecurityTab } from './SecurityTab'
import { BillingTab } from './BillingTab'
import { DangerZoneTab } from './DangerZoneTab'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

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

        <Tabs value={activeTab} onValueChange={(value) => setTab(value as Tab)} className="mb-6 overflow-x-auto">
          <TabsList>
            {TABS.map((tab) => <TabsTrigger key={tab} value={tab} data-testid={`profile-tab-${tab}`}>{tabLabels[tab]}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        <div data-testid="profile-tab-content">
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'danger-zone' && <DangerZoneTab />}
        </div>
      </div>
    </div>
  )
}
