import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
  {
    permission: OrgPermission.MANAGE_RESOURCES,
    label: 'org.perm.resources',
    fallback: 'Manage resources',
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
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-sm" onClose={onClose} data-testid="member-permissions-dialog">
        <DialogHeader>
          <DialogTitle>{t('org.editPermissions', 'Edit Permissions')}</DialogTitle>
        </DialogHeader>
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
        {updatePerms.isError && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {t('common.serverError')}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={updatePerms.isPending}
            data-testid="member-permissions-save"
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
