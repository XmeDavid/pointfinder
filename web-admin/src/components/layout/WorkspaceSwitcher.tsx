import { Plus } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWorkspaces } from '../../hooks/queries/useWorkspaces'
import { useWorkspaceContext } from '../../stores/workspaceContext'
import { cn } from '../../lib/utils/cn'
import { useTranslation } from 'react-i18next'

export function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: workspaces } = useWorkspaces()
  const { active, setActive } = useWorkspaceContext()

  const isPersonalActive = active.type === 'personal'

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Personal workspace */}
      <button
        onClick={() => {
          setActive({ type: 'personal' })
          if (location.pathname !== '/dashboard') navigate('/dashboard')
        }}
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm transition-all cursor-pointer',
          'bg-override',
          isPersonalActive ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'
        )}
        title={t('workspace.personal', 'Personal')}
        aria-label={t('workspace.personal', 'Personal')}
      >
        P
      </button>

      {/* Divider */}
      {workspaces?.organizations && workspaces.organizations.length > 0 && (
        <div className="h-px w-5 bg-border" />
      )}

      {/* Org workspaces */}
      {workspaces?.organizations?.map((org) => {
        const isActive = active.type === 'org' && active.orgId === org.id
        const initials = org.name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .substring(0, 3)
          .toUpperCase()

        return (
          <button
            key={org.id}
            onClick={() => {
              setActive({ type: 'org', orgId: org.id, orgName: org.name })
              if (location.pathname !== '/dashboard') navigate('/dashboard')
            }}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs transition-all cursor-pointer',
              'bg-primary',
              isActive ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'
            )}
            title={org.name}
            aria-label={org.name}
          >
            {initials}
          </button>
        )
      })}

      {/* Create org button — navigates to checkout page, no free orgs */}
      <button
        onClick={() => navigate('/org/create')}
        className="mt-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-override/50 text-override transition-colors hover:border-override hover:bg-override/10"
        title={t('workspace.createOrg', 'Create organization')}
        aria-label={t('workspace.createOrg', 'Create organization')}
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
