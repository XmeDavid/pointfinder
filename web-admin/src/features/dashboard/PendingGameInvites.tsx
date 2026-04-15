import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Gamepad2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invitesApi } from '@/lib/api/invites'
import { useAuthStore } from '@/lib/auth/store'

export function PendingGameInvites() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAuthenticated, accessToken } = useAuthStore()

  const { data: invites, isLoading } = useQuery({
    queryKey: ['invites', 'my'],
    queryFn: () => invitesApi.getMyInvites(),
    enabled: isAuthenticated && !!accessToken,
  })

  const acceptMutation = useMutation({
    mutationFn: (inviteId: string) => invitesApi.accept(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites', 'my'] })
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })

  // Only show game invites (those with a gameId)
  const gameInvites = invites?.filter((inv) => inv.gameId && inv.status === 'pending') ?? []

  if (isLoading || gameInvites.length === 0) return null

  const handleAccept = (inviteId: string, gameId: string) => {
    acceptMutation.mutate(inviteId, {
      onSuccess: () => {
        navigate(`/game/${gameId}`)
      },
    })
  }

  return (
    <div className="mb-6 space-y-2">
      {gameInvites.map((invite) => (
        <div
          key={invite.id}
          className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
        >
          <Gamepad2 className="h-4 w-4 shrink-0 text-primary" />
          <p className="flex-1 text-sm text-foreground">
            {t('game.invitedToOperate', "You've been invited to operate")}{' '}
            <span className="font-medium">{invite.gameName ?? t('game.aGame', 'a game')}</span>
            {invite.inviterName && (
              <>
                {' '}
                {t('game.invitedBy', 'by')}{' '}
                <span className="font-medium">{invite.inviterName}</span>
              </>
            )}
          </p>
          <button
            onClick={() => handleAccept(invite.id, invite.gameId!)}
            disabled={acceptMutation.isPending}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {t('game.acceptInvite', 'Accept')}
          </button>
        </div>
      ))}
    </div>
  )
}
