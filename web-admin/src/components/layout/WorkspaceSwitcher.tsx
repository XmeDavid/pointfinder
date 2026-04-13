import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaces } from '../../hooks/queries/useWorkspaces'
import { useWorkspaceContext } from '../../stores/workspaceContext'
import { cn } from '../../lib/utils/cn'
import { useTranslation } from 'react-i18next'

export function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: workspaces } = useWorkspaces()
  const { active, setActive } = useWorkspaceContext()

  const isPersonalActive = active.type === 'personal'

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Personal workspace */}
      <button
        onClick={() => setActive({ type: 'personal' })}
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm transition-all',
          'bg-indigo-500',
          isPersonalActive ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'
        )}
        title={t('workspace.personal', 'Personal')}
        aria-label={t('workspace.personal', 'Personal')}
      >
        P
      </button>

      {/* Divider */}
      {workspaces?.organizations && workspaces.organizations.length > 0 && (
        <div className="w-5 h-px bg-indigo-400/50" />
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
            onClick={() => setActive({ type: 'org', orgId: org.id, orgName: org.name })}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs transition-all',
              'bg-emerald-600',
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
        className="mt-2 w-9 h-9 rounded-lg border-2 border-dashed border-indigo-500/50 flex items-center justify-center text-indigo-400 hover:border-indigo-400 hover:text-indigo-300 transition-colors"
        title={t('workspace.createOrg', 'Create organization')}
        aria-label={t('workspace.createOrg', 'Create organization')}
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
