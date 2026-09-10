import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, CheckCircle2 } from 'lucide-react'
import { ApiError } from '@pointfinder/api'
import { useAccountSession, useAuth, useServices } from '@/app/player/services'
import { getDeviceId } from '@/app/player/device'
import { describeError } from '@/app/player/errors'
import { Alert, Button, ConfirmDeleteDialog } from '@/components'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Screen } from '@/features/player/components/Screen'
import { AccountCredentialsForm } from '@/features/player/components/AccountCredentialsForm'
import { usePlayerGame } from '@/features/player/usePlayerGame'

type Conflict = { teamName: string; sameTeam: boolean }

/**
 * PF-02: save the current participation to the phone's account, in place. The
 * phone signs in (or creates the account) once and stays signed in; the player
 * session never changes. When the account already plays this game elsewhere,
 * the player can switch this phone to that participation once the queue is empty.
 */
export default function AccountScreen() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const auth = useAuth()
  const session = useAccountSession()
  const { client, account: accountServices } = useServices()
  const game = usePlayerGame()
  const queries = useQueryClient()
  const navigate = useNavigate()
  const link = useQuery({ queryKey: ['account', 'link'], queryFn: () => client.api.player.account(), enabled: auth.kind === 'player' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)

  const signedInEmail = session.kind === 'operator' ? session.email : null

  /** Link the current row to the phone's account, by session token. */
  async function save() {
    setBusy(true)
    setError(null)
    try {
      const token = await accountServices.accessToken()
      if (!token) throw new Error('No account session')
      const linked = await client.api.player.linkAccount({ accountAccessToken: token, createAccount: false })
      if (accountServices.session.current.kind !== 'operator') {
        // Signed out while the link was in flight: do not leave the game attached to an account this phone no longer holds.
        await client.api.player.unlinkAccount().catch(() => {})
        return
      }
      queries.setQueryData(['account', 'link'], linked)
      void queries.invalidateQueries({ queryKey: ['account', 'me'] })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_ALREADY_IN_GAME') {
        // Switching phones replaces the session, which would orphan anything still queued here.
        if (game.pending.length > 0) setError(t('account.switchBlocked', { count: game.pending.length }))
        else setConflict({ teamName: err.fieldErrors.teamName ?? '', sameTeam: err.fieldErrors.sameTeam === 'true' })
      } else if (err instanceof ApiError && err.code === 'PLAYER_ALREADY_LINKED') {
        setError(t('account.alreadyLinked'))
      } else {
        setError(describeError(err, t))
      }
    } finally {
      setBusy(false)
    }
  }

  /** Replace this phone's guest session with the account's existing participation. */
  async function switchDevice() {
    if (auth.kind !== 'player') return
    setConflict(null)
    setBusy(true)
    setError(null)
    try {
      const recovered = await accountServices.api.account.recover(auth.gameId, await getDeviceId())
      await client.session.setPlayer(recovered)
      navigate('/', { replace: true })
    } catch (err) {
      setError(describeError(err, t))
    } finally {
      setBusy(false)
    }
  }

  if (auth.kind !== 'player') return null

  return (
    <Screen>
      <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {t('account.back')}</Link>
      <h1 className="text-2xl font-semibold leading-tight text-balance">{t('account.title')}</h1>

      {link.isLoading && <LoadingState label={t('common.loading')} />}
      {link.isError && <ErrorState title={describeError(link.error, t)} retryLabel={t('common.retry')} onRetry={() => void link.refetch()} />}

      {link.data?.linked && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" data-testid="account-linked">
          <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-5 w-5 text-success" aria-hidden />{t('account.linked')}</p>
          <p className="text-sm text-muted-foreground">{t('account.linkedHint')} <span className="font-medium text-foreground">{link.data.email}</span>.</p>
          {!link.data.emailVerified && <p className="text-xs text-muted-foreground" data-testid="account-unverified">{t('settings.emailUnverified')}</p>}
          <Button type="button" variant="outline" onClick={() => navigate('/settings')}>{t('common.done')}</Button>
        </div>
      )}

      {link.data && !link.data.linked && signedInEmail && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" data-testid="account-save-to">
          <p className="text-sm"><span className="text-muted-foreground">{t('account.signedInAs')}</span> <span className="font-medium">{signedInEmail}</span></p>
          <p className="text-sm text-muted-foreground">{t('account.saveToAccountHint')}</p>
          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          <Button size="lg" type="button" className="text-base" disabled={busy} onClick={() => void save()} data-testid="account-save">{t('account.saveToAccount', { email: signedInEmail })}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void accountServices.signOut()} data-testid="account-not-you">{t('account.notYou')}</Button>
        </div>
      )}

      {link.data && !link.data.linked && !signedInEmail && (
        <>
          <p className="text-muted-foreground">{t('account.subtitle')}</p>
          <AccountCredentialsForm initialName={auth.displayName} onDone={save} />
        </>
      )}

      <ConfirmDeleteDialog
        open={conflict !== null}
        onCancel={() => setConflict(null)}
        onConfirm={() => void switchDevice()}
        title={t('account.alreadyInGameTitle')}
        description={conflict?.sameTeam ? t('account.alreadyInGameSameTeam', { team: conflict.teamName }) : t('account.alreadyInGame', { team: conflict?.teamName ?? '' })}
        confirmLabel={t('account.switchDevice')}
        variant="default"
      />
    </Screen>
  )
}
