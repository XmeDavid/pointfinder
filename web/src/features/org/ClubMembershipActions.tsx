import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { getApiErrorMessage } from '@/lib/api/errors'
import { useLeaveOrg, useTransferOrgOwnership } from '@/hooks/mutations/useOrgMutations'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import type { OrgMember } from '@/types/organization'

interface Props {
  orgId: string
  orgName: string
  members: OrgMember[]
  currentUserId: string | undefined
  /** The creator cannot leave: they hand the club on instead. */
  isCreator: boolean
}

/**
 * What a member can do about their own membership, on the members page beside
 * every other membership decision. The two are exclusive by design: the club's
 * creator cannot leave — the backend refuses it — so they are offered the
 * transfer that would let them.
 */
export function ClubMembershipActions({ orgId, orgName, members, currentUserId, isCreator }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setActive = useWorkspaceContext((s) => s.setActive)
  const leave = useLeaveOrg()
  const transfer = useTransferOrgOwnership(orgId)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [confirmingTransfer, setConfirmingTransfer] = useState(false)
  const [target, setTarget] = useState('')

  const candidates = members.filter((m) => m.userId !== currentUserId)
  const targetName = members.find((m) => m.userId === target)?.name ?? ''

  const handleLeave = () => {
    leave.mutate(orgId, {
      onSuccess: () => {
        setConfirmingLeave(false)
        // The workspace we were standing in is no longer ours.
        setActive({ type: 'personal' })
        navigate('/dashboard')
      },
    })
  }

  if (isCreator) {
    return (
      <section className="mt-10 max-w-lg" data-testid="club-transfer">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {t('club.transfer.title')}
        </h2>
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">{t('club.transfer.creatorDesc')}</p>
          {candidates.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('club.transfer.noCandidates')}</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                aria-label={t('club.transfer.pickMember')}
                data-testid="club-transfer-target"
                className="max-w-xs"
              >
                <option value="">{t('club.transfer.pickMember')}</option>
                {candidates.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name} — {m.email}</option>
                ))}
              </Select>
              <Button
                variant="outline"
                disabled={!target || transfer.isPending}
                onClick={() => setConfirmingTransfer(true)}
                data-testid="club-transfer-btn"
              >
                {t('club.transfer.action')}
              </Button>
            </div>
          )}
          {transfer.isError && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {getApiErrorMessage(transfer.error, t('common.serverError'))}
            </p>
          )}
        </div>

        <ConfirmDeleteDialog
          open={confirmingTransfer}
          variant="default"
          onConfirm={() =>
            transfer.mutate(target, { onSuccess: () => setConfirmingTransfer(false) })
          }
          onCancel={() => setConfirmingTransfer(false)}
          title={t('club.transfer.title')}
          description={t('club.transfer.confirm', { name: targetName, club: orgName })}
          confirmLabel={t('club.transfer.action')}
        />
      </section>
    )
  }

  return (
    <section className="mt-10 max-w-lg" data-testid="club-leave">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {t('club.leave.title')}
      </h2>
      <div className="rounded-lg border border-border p-4">
        <p className="text-sm text-muted-foreground">{t('club.leave.desc')}</p>
        <Button
          variant="outline"
          className="mt-3 border-destructive text-destructive"
          disabled={leave.isPending}
          onClick={() => setConfirmingLeave(true)}
          data-testid="club-leave-btn"
        >
          {t('club.leave.action')}
        </Button>
        {leave.isError && (
          <p className="mt-2 text-sm text-destructive" role="alert" data-testid="club-leave-error">
            {getApiErrorMessage(leave.error, t('common.serverError'))}
          </p>
        )}
      </div>

      <ConfirmDeleteDialog
        open={confirmingLeave}
        onConfirm={handleLeave}
        onCancel={() => setConfirmingLeave(false)}
        title={t('club.leave.title')}
        description={t('club.leave.confirm', { name: orgName })}
        confirmLabel={t('club.leave.action')}
      />
    </section>
  )
}
