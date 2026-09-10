import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAccountSession, useServices } from '@/app/player/services'
import { getDeviceId } from '@/app/player/device'
import { describeError } from '@/app/player/errors'
import { Alert, Button } from '@/components'
import { BrandLockup } from '@/components/brand'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { GameStatusBadge } from '@/components/status'
import { Screen } from '@/features/player/components/Screen'

/** PF-01: the signed-in account's games, each one a tap away on this phone. */
export default function RecoverScreen() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const session = useAccountSession()
  const { client, account } = useServices()
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['account', 'me'], queryFn: () => account.api.account.me(), enabled: session.kind === 'operator' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function recover(gameId: string) {
    setBusy(gameId)
    setError(null)
    try {
      const res = await account.api.account.recover(gameId, await getDeviceId())
      await client.session.setPlayer(res)
      navigate('/', { replace: true })
    } catch (err) {
      setError(describeError(err, t))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen>
      <Link className="text-sm text-muted-foreground" to="/join">{t('common.back')}</Link>
      <BrandLockup size={22} className="text-sm" />
      <h1 className="text-2xl font-semibold leading-tight text-balance">{t('recover.title')}</h1>

      {session.kind !== 'operator' && (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground">{t('recover.subtitle')}</p>
          <Link to="/join/account?mode=signIn&next=/join/recover" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground" data-testid="recover-sign-in">{t('account.signIn')}</Link>
        </div>
      )}

      {session.kind === 'operator' && (
        <>
          <p className="text-sm"><span className="text-muted-foreground">{t('account.signedInAs')}</span> <span className="font-medium">{session.email}</span></p>
          {me.isLoading && <LoadingState label={t('common.loading')} />}
          {me.isError && <ErrorState title={describeError(me.error, t)} retryLabel={t('common.retry')} onRetry={() => void me.refetch()} />}
          {me.data && me.data.participations.length === 0 && <EmptyState title={t('account.noGames')} data-testid="recover-empty" />}
          {me.data && me.data.participations.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card" aria-label={t('account.myGames')} data-testid="recover-list">
              {me.data.participations.map((p) => (
                <li key={p.playerId} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`recover-game-${p.gameId}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.gameName}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block h-2.5 w-2.5 rounded-full border border-border" style={{ background: p.teamColor }} aria-hidden />{p.teamName} <GameStatusBadge status={p.gameStatus} /></span>
                  </span>
                  <Button type="button" size="sm" disabled={busy !== null || p.gameStatus === 'ended'} onClick={() => void recover(p.gameId)} data-testid={`recover-btn-${p.gameId}`}>{t('account.getBack')}</Button>
                </li>
              ))}
            </ul>
          )}
          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          <Button type="button" variant="ghost" onClick={() => void account.signOut()} data-testid="recover-sign-out">{t('account.notYou')}</Button>
        </>
      )}
    </Screen>
  )
}
