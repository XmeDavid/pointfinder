import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, CheckCircle2 } from 'lucide-react'
import { ApiError } from '@pointfinder/api'
import { useAuth, useServices } from '@/app/player/services'
import { getDeviceId } from '@/app/player/device'
import { describeError } from '@/app/player/errors'
import { Alert, Button, ConfirmDeleteDialog, Input, Label } from '@/components'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Screen } from '@/features/player/components/Screen'
import { usePlayerGame } from '@/features/player/usePlayerGame'

type Mode = 'create' | 'signIn'
type Conflict = { teamName: string; sameTeam: boolean; email: string; password: string }

/**
 * PF-02: save a guest participation to an account, in place. Credentials travel
 * once; the player session never changes. When the account already plays this
 * game elsewhere, the player can switch this phone to that participation, but
 * only once nothing is left in the offline queue.
 */
export default function AccountScreen() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const auth = useAuth()
  const { client } = useServices()
  const game = usePlayerGame()
  const queries = useQueryClient()
  const navigate = useNavigate()
  const account = useQuery({ queryKey: ['account'], queryFn: () => client.api.player.account(), enabled: auth.kind === 'player' })

  const [mode, setMode] = useState<Mode>('create')
  const [email, setEmail] = useState('')
  const [name, setName] = useState(auth.kind === 'player' ? auth.displayName : '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const linked = await client.api.player.linkAccount({ email: email.trim(), password, name: mode === 'create' ? name.trim() : undefined, createAccount: mode === 'create' })
      queries.setQueryData(['account'], linked)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_ALREADY_IN_GAME') {
        // Switching phones replaces the session, which would orphan anything still queued here.
        if (game.pending.length > 0) setError(t('account.switchBlocked', { count: game.pending.length }))
        else setConflict({ teamName: err.fieldErrors.teamName ?? '', sameTeam: err.fieldErrors.sameTeam === 'true', email: email.trim(), password })
      } else if (err instanceof ApiError && err.code === 'EMAIL_ALREADY_TAKEN') {
        setError(t('account.emailTaken'))
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
    if (!conflict || auth.kind !== 'player') return
    const { email, password } = conflict
    setConflict(null)
    setBusy(true)
    setError(null)
    try {
      const deviceId = await getDeviceId()
      const recovered = await client.api.auth.playerRecover({ email, password, deviceId, gameId: auth.gameId })
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

      {account.isLoading && <LoadingState label={t('common.loading')} />}

      {account.data?.linked && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" data-testid="account-linked">
          <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-5 w-5 text-success" aria-hidden />{t('account.linked')}</p>
          <p className="text-sm text-muted-foreground">{t('account.linkedHint')} <span className="font-medium text-foreground">{account.data.email}</span>.</p>
          {!account.data.emailVerified && <p className="text-xs text-muted-foreground" data-testid="account-unverified">{t('settings.emailUnverified')}</p>}
          <Button type="button" variant="outline" onClick={() => navigate('/settings')}>{t('common.done')}</Button>
        </div>
      )}

      {account.data && !account.data.linked && (
        <>
          <p className="text-muted-foreground">{t('account.subtitle')}</p>
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label={t('account.title')}>
            <Button type="button" role="tab" aria-selected={mode === 'create'} variant={mode === 'create' ? 'default' : 'outline'} onClick={() => setMode('create')} data-testid="account-mode-create">{t('account.create')}</Button>
            <Button type="button" role="tab" aria-selected={mode === 'signIn'} variant={mode === 'signIn' ? 'default' : 'outline'} onClick={() => setMode('signIn')} data-testid="account-mode-signin">{t('account.signIn')}</Button>
          </div>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="account-email">{t('account.email')}</Label>
              <Input id="account-email" type="email" className="h-12 text-base" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" data-testid="account-email" />
            </div>
            {mode === 'create' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-name">{t('account.name')}</Label>
                <Input id="account-name" className="h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" data-testid="account-name" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="account-password">{t('account.password')}</Label>
              <Input id="account-password" type="password" className="h-12 text-base" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'create' ? 8 : 1} maxLength={128} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} data-testid="account-password" />
              {mode === 'create' && <p className="text-xs text-muted-foreground">{t('account.passwordHint')}</p>}
            </div>
            {error && <Alert variant="destructive" role="alert">{error}</Alert>}
            <Button size="lg" type="submit" className="text-base" disabled={busy || !email.trim() || !password || (mode === 'create' && !name.trim())} data-testid="account-submit">
              {mode === 'create' ? t('account.submitCreate') : t('account.submitSignIn')}
            </Button>
          </form>
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
