import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, FolderOpen } from 'lucide-react'
import type { Game } from '@/types'
import { useAccountSession, useServices } from '@/app/player/services'
import { useAuthStore } from '@/lib/auth/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { gamesApi } from '@/lib/api/games'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { Button } from '@/components/ui/button'
import { GameStatusBadge } from '@/components/status'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { findRecentOrganizedGame, recentOrganizedGames } from './organizingRecency'
import { OrganizerSessionBridge } from './OrganizerSessionBridge'

/** Home's organizer continuation, always below the active-player priority. */
export function ContinueOrganizing() {
  const { t } = useTranslation(undefined, { keyPrefix: 'experience' })
  const navigate = useNavigate()
  const operator = useAuthStore(s => s.isAuthenticated ? s.user : null)
  const account = useAccountSession()
  const services = useServices()
  const active = useWorkspaceContext(s => s.active)
  const orgId = active.type === 'org' ? active.orgId : null
  const accountId = operator?.id ?? (account.kind === 'operator' ? account.userId : null)
  const canOrganize = operator ? ['operator', 'admin'].includes(operator.role)
    : account.kind === 'operator' && ['operator', 'admin'].includes(account.role)
  const [opening, setOpening] = useState<{ accountId: string; gameId: string } | null>(null)
  const query = useQuery({
    queryKey: ['organizing-continuation', accountId, orgId, operator ? 'operator' : 'account'],
    enabled: !!accountId && canOrganize && opening?.accountId !== accountId,
    queryFn: async ({ signal }) => {
      const operatorVersion = useAuthStore.getState().sessionVersion
      const requireCurrent = () => {
        const current = useAuthStore.getState()
        const currentAccount = services.account.session.current
        const same = operator
          ? current.isAuthenticated && current.user?.id === accountId && current.sessionVersion === operatorVersion
          : currentAccount.kind === 'operator' && currentAccount.userId === accountId
        if (signal.aborted || !same) throw new Error('Account changed')
      }
      const ids = await recentOrganizedGames(accountId!, orgId)
      requireCurrent()
      return findRecentOrganizedGame(ids, orgId, async id => {
        requireCurrent()
        const game = await (operator ? gamesApi.getById(id) : services.account.api.games.get(id))
        requireCurrent()
        return game
      })
    },
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  })

  useEffect(() => {
    if (opening && operator?.id === opening.accountId && accountId === opening.accountId) {
      navigate(`/game/${opening.gameId}`)
    }
  }, [opening, operator?.id, accountId, navigate])

  if (!accountId || !canOrganize) return null
  if (opening?.accountId === accountId) return <OrganizerSessionBridge />
  if (query.isError) return (
    <section data-testid="continue-organizing-error">
      <ErrorState title={t('continueOrganizingError')} retryLabel={t('retry')} onRetry={() => void query.refetch()} />
    </section>
  )
  // Hide cached private names until the current account has revalidated access.
  if (query.isPending || query.isFetching) return <LoadingState label={t('continueOrganizingLoading')} />
  if (!query.data) return null
  const game = query.data
  return <ContinueOrganizingCard game={game} onContinue={() => {
    if (operator) navigate(`/game/${game.id}`)
    else setOpening({ accountId, gameId: game.id })
  }} />
}

export function ContinueOrganizingCard({ game, onContinue }: {
  game: Pick<Game, 'name' | 'status'>
  onContinue: () => void
}) {
  const { t } = useTranslation(undefined, { keyPrefix: 'experience' })
  return (
    <section className="mt-5" aria-label={t('continueOrganizing')} data-testid="continue-organizing">
      <SurfacePanel padding="lg">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><FolderOpen size={16} aria-hidden />{t('continueOrganizing')}</span>
          <GameStatusBadge status={game.status} />
        </div>
        <h2 className="mt-5 text-3xl font-semibold leading-tight text-balance break-words">{game.name}</h2>
        <Button size="lg" className="mt-6 w-full gap-3" data-testid="continue-organizing-btn" onClick={onContinue}>
          {t('continueOrganizing')}<ArrowRight size={17} aria-hidden />
        </Button>
      </SurfacePanel>
    </section>
  )
}
