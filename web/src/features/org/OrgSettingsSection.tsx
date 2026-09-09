import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { useDeleteOrg, useUpdateOrg } from '../../hooks/mutations/useOrgMutations'
import { useWorkspaceContext } from '../../stores/workspaceContext'

interface Props {
  orgId: string
  orgName: string
  /** Deleting a club is the creator's call alone; renaming is not. */
  canDelete: boolean
}

/**
 * Rename and delete for the active club, on the members page so every
 * membership decision lives on one surface. Both actions are audited
 * server-side; the client only guards the obvious mistakes.
 */
export function OrgSettingsSection({ orgId, orgName, canDelete }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setActive = useWorkspaceContext((s) => s.setActive)
  const rename = useUpdateOrg(orgId)
  const deleteOrg = useDeleteOrg()
  const [name, setName] = useState(orgName)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const trimmed = name.trim()
  const unchanged = trimmed === orgName
  const canSave = trimmed.length > 0 && !unchanged && !rename.isPending

  const handleRename = () => {
    if (!canSave) return
    rename.mutate(trimmed)
  }

  const handleDelete = () => {
    deleteOrg.mutate(orgId, {
      onSuccess: () => {
        setConfirmingDelete(false)
        // The workspace we were standing in no longer exists.
        setActive({ type: 'personal' })
        navigate('/dashboard')
      },
    })
  }

  return (
    <section className="mt-10 max-w-lg" data-testid="org-settings">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {t('org.settings')}
      </h2>

      <div className="rounded-lg border border-border p-4">
        <label htmlFor="org-name" className="block text-sm font-medium text-foreground mb-1">
          {t('workspace.orgName', 'Organization name')}
        </label>
        <div className="flex gap-2">
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            data-testid="org-name-input"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
          <button
            onClick={handleRename}
            disabled={!canSave}
            data-testid="org-rename-save"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rename.isPending ? t('common.saving', 'Saving...') : t('common.save')}
          </button>
        </div>
        {rename.isError && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {t('common.serverError')}
          </p>
        )}
        {rename.isSuccess && trimmed === rename.variables && (
          <p className="mt-2 text-sm text-muted-foreground" data-testid="org-rename-saved">
            {t('org.renamed')}
          </p>
        )}
      </div>

      {canDelete && (
        <div className="mt-4 rounded-lg border border-destructive/40 p-4" data-testid="org-danger-zone">
          <p className="text-sm font-medium text-foreground">{t('org.deleteTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('org.deleteDesc')}</p>
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={deleteOrg.isPending}
            data-testid="org-delete-btn"
            className="mt-3 px-4 py-2 rounded-lg border border-destructive text-destructive text-sm font-medium disabled:opacity-50"
          >
            {t('org.deleteAction')}
          </button>
          {deleteOrg.isError && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {t('common.serverError')}
            </p>
          )}
        </div>
      )}

      <ConfirmDeleteDialog
        open={confirmingDelete}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
        title={t('org.deleteTitle')}
        description={t('org.deleteConfirm', { name: orgName })}
        confirmLabel={t('org.deleteAction')}
      />
    </section>
  )
}
