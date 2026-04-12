import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateOrgPermissions } from '../../hooks/mutations/useOrgMutations'
import { OrgPermission } from '../../types/organization'

interface Props {
  orgId: string
  userId: string
  currentPermissions: number
  onClose: () => void
}

const PERMISSION_LIST = [
  {
    permission: OrgPermission.OPERATE_GAMES,
    label: 'org.perm.operate',
    fallback: 'Operate games',
  },
  {
    permission: OrgPermission.CREATE_GAMES,
    label: 'org.perm.create',
    fallback: 'Create games',
  },
  {
    permission: OrgPermission.DELETE_GAMES,
    label: 'org.perm.delete',
    fallback: 'Delete games',
  },
  {
    permission: OrgPermission.INVITE_MEMBERS,
    label: 'org.perm.invite',
    fallback: 'Invite members',
  },
  {
    permission: OrgPermission.MANAGE_PERMS,
    label: 'org.perm.manage',
    fallback: 'Manage permissions',
  },
  {
    permission: OrgPermission.MANAGE_BILLING,
    label: 'org.perm.billing',
    fallback: 'Manage billing',
  },
]

export function MemberPermissionsDialog({
  orgId,
  userId,
  currentPermissions,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const [perms, setPerms] = useState(currentPermissions)
  const updatePerms = useUpdateOrgPermissions(orgId)

  const toggle = (bit: number) => {
    if (bit === OrgPermission.OPERATE_GAMES) return
    setPerms((prev) => prev ^ bit)
  }

  const handleSave = () => {
    updatePerms.mutate(
      { userId, permissions: perms },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl p-6 w-80 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-foreground">
          {t('org.editPermissions', 'Edit Permissions')}
        </h3>
        <div className="space-y-2">
          {PERMISSION_LIST.map(({ permission, label, fallback }) => (
            <label key={permission} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(perms & permission) !== 0}
                onChange={() => toggle(permission)}
                disabled={permission === OrgPermission.OPERATE_GAMES}
                className="rounded"
              />
              {t(label, fallback)}
            </label>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted-foreground"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={updatePerms.isPending}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
          >
            {t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
