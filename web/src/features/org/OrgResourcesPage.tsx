import { useTranslation } from 'react-i18next'
import { useWorkspaceContext } from '../../stores/workspaceContext'
import { ResourceBrowser } from './ResourceBrowser'

export function OrgResourcesPage() {
  const { t } = useTranslation()
  const { active } = useWorkspaceContext()
  if (active.type !== 'org') return null

  return (
    <div className="h-screen bg-background overflow-auto flex flex-col">
      <div className="px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold text-foreground">
          {t('resources.title', 'Resources')}
        </h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <ResourceBrowser orgId={active.orgId} />
      </div>
    </div>
  )
}
