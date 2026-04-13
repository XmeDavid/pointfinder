import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceContext } from '../../stores/workspaceContext'
import { useOrgMembers, useOrgInvites } from '../../hooks/queries/useOrganization'
import { useCreateOrgInvite, useRemoveOrgMember, useRevokeOrgInvite } from '../../hooks/mutations/useOrgMutations'
import { hasPermission, OrgPermission } from '../../types/organization'
import { useAuthStore } from '../../lib/auth/store'
import { MemberPermissionsDialog } from './MemberPermissionsDialog'
import { useQuota } from '../../hooks/queries/useQuota'

export function OrgMembersPage() {
  const { t } = useTranslation()
  const { active } = useWorkspaceContext()
  const user = useAuthStore((s) => s.user)
  const orgId = active.type === 'org' ? active.orgId : undefined
  const { data: members, isLoading } = useOrgMembers(orgId)
  const { data: pendingInvites, isLoading: invitesLoading } = useOrgInvites(orgId)
  const createInvite = useCreateOrgInvite(orgId ?? '')
  const revokeInvite = useRevokeOrgInvite(orgId ?? '')
  const removeMember = useRemoveOrgMember(orgId ?? '')
  const [inviteEmail, setInviteEmail] = useState('')
  const [editingMember, setEditingMember] = useState<string | null>(null)

  const { data: quota } = useQuota()

  if (active.type !== 'org') return null

  const myMembership = members?.find((m) => m.userId === user?.id)
  const canInvite = myMembership
    ? hasPermission(myMembership.permissions, OrgPermission.INVITE_MEMBERS)
    : false

  const atMemberLimit =
    quota != null &&
    quota.limits.maxMembers !== null &&
    quota.usage.currentMembers !== null &&
    quota.usage.currentMembers >= quota.limits.maxMembers
  const canManagePerms = myMembership
    ? hasPermission(myMembership.permissions, OrgPermission.MANAGE_PERMS)
    : false

  const handleInvite = () => {
    if (!inviteEmail.trim()) return
    createInvite.mutate(inviteEmail.trim(), {
      onSuccess: () => setInviteEmail(''),
    })
  }

  return (
    <div className="h-screen bg-background p-8 overflow-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {t('org.members', 'Members')}
      </h1>

      {canInvite && (
        <div className="flex gap-2 mb-6 max-w-md">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder={t('org.inviteEmail', 'operator@example.com')}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            onKeyDown={(e) => e.key === 'Enter' && !atMemberLimit && handleInvite()}
          />
          <button
            onClick={handleInvite}
            disabled={createInvite.isPending || !!atMemberLimit}
            title={atMemberLimit ? t('quota.memberLimit', 'Member limit reached. Upgrade your plan.') : undefined}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createInvite.isPending
              ? t('common.sending', 'Sending...')
              : t('org.invite', 'Invite')}
          </button>
        </div>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</p>
      )}

      <div className="space-y-2 max-w-lg">
        {members?.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between px-4 py-3 rounded-lg border border-border"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{member.name}</p>
              <p className="text-xs text-muted-foreground">{member.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {canManagePerms && member.userId !== user?.id && (
                <button
                  onClick={() => setEditingMember(member.userId)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('org.permissions', 'Permissions')}
                </button>
              )}
              {canInvite && member.userId !== user?.id && (
                <button
                  onClick={() => removeMember.mutate(member.userId)}
                  className="text-xs text-destructive hover:text-destructive/80"
                >
                  {t('common.remove', 'Remove')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pending invites section */}
      {canInvite && !invitesLoading && pendingInvites && pendingInvites.length > 0 && (
        <div className="mt-8 max-w-lg">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {t('org.pendingInvites', 'Pending Invites')}
          </h2>
          <div className="space-y-2">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-dashed border-border"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('org.invitedBy', 'Invited by')} {invite.inviterName ?? t('common.unknown', 'Unknown')}
                  </p>
                </div>
                <button
                  onClick={() => revokeInvite.mutate(invite.id)}
                  disabled={revokeInvite.isPending}
                  className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
                >
                  {t('org.revokeInvite', 'Revoke')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingMember && orgId && (
        <MemberPermissionsDialog
          orgId={orgId}
          userId={editingMember}
          currentPermissions={
            members?.find((m) => m.userId === editingMember)?.permissions ?? 1
          }
          onClose={() => setEditingMember(null)}
        />
      )}
    </div>
  )
}
