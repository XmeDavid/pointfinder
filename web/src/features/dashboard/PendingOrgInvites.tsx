import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useMyOrgInvites } from '@/hooks/queries/useOrganization'
import { useAcceptOrgInvite } from '@/hooks/mutations/useOrgMutations'
import { useWorkspaceContext } from '@/stores/workspaceContext'

export function PendingOrgInvites() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: invites, isLoading } = useMyOrgInvites()
  const acceptInvite = useAcceptOrgInvite()
  const { setActive } = useWorkspaceContext()

  if (isLoading || !invites || invites.length === 0) return null

  const handleAccept = (inviteId: string, orgId: string, orgName: string) => {
    acceptInvite.mutate(inviteId, {
      onSuccess: () => {
        setActive({ type: 'org', orgId, orgName })
        navigate('/dashboard')
      },
    })
  }

  return (
    <div className="mb-6 space-y-2">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
        >
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <p className="flex-1 text-sm text-foreground">
            {t('org.invitedToJoin', "You've been invited to join")}{' '}
            <span className="font-medium">{invite.orgName}</span>
            {invite.inviterName && (
              <>
                {' '}
                {t('org.invitedBy', 'by')}{' '}
                <span className="font-medium">{invite.inviterName}</span>
              </>
            )}
          </p>
          <button
            onClick={() => handleAccept(invite.id, invite.orgId, invite.orgName)}
            disabled={acceptInvite.isPending}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {t('org.acceptInvite', 'Accept')}
          </button>
        </div>
      ))}
    </div>
  )
}
