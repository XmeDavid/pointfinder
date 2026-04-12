import { Plus } from 'lucide-react'
import { useWorkspaces } from '../../hooks/queries/useWorkspaces'
import { useWorkspaceContext } from '../../stores/workspaceContext'
import { cn } from '../../lib/utils/cn'
import { useState } from 'react'
import { useCreateOrg } from '../../hooks/mutations/useOrgMutations'
import { useTranslation } from 'react-i18next'

export function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const { data: workspaces } = useWorkspaces()
  const { active, setActive } = useWorkspaceContext()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const createOrg = useCreateOrg()

  const isPersonalActive = active.type === 'personal'

  const handleCreateOrg = () => {
    if (!newOrgName.trim()) return
    createOrg.mutate(newOrgName.trim(), {
      onSuccess: (org) => {
        setActive({ type: 'org', orgId: org.id, orgName: org.name })
        setShowCreateDialog(false)
        setNewOrgName('')
      },
    })
  }

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

      {/* Create org button */}
      <button
        onClick={() => setShowCreateDialog(true)}
        className="mt-2 w-9 h-9 rounded-lg border-2 border-dashed border-indigo-500/50 flex items-center justify-center text-indigo-400 hover:border-indigo-400 hover:text-indigo-300 transition-colors"
        title={t('workspace.createOrg', 'Create organization')}
        aria-label={t('workspace.createOrg', 'Create organization')}
      >
        <Plus size={16} />
      </button>

      {/* Create org dialog */}
      {showCreateDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowCreateDialog(false)}
        >
          <div
            className="bg-background rounded-xl p-6 w-80 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-foreground">
              {t('workspace.createOrg', 'Create organization')}
            </h3>
            <input
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder={t('workspace.orgName', 'Organization name')}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="px-3 py-1.5 text-sm text-muted-foreground"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreateOrg}
                disabled={createOrg.isPending || !newOrgName.trim()}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {createOrg.isPending ? '...' : t('common.create', 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
