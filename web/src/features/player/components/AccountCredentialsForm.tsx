import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@pointfinder/api'
import { useServices } from '@/app/player/services'
import { getDeviceId } from '@/app/player/device'
import { describeError } from '@/app/player/errors'
import { Alert, Button, Input, Label } from '@/components'

export type AccountMode = 'create' | 'signIn'

/**
 * Create a participant account or sign in to an existing one. Either way the
 * phone ends up with an account session that stays until sign-out.
 */
export function AccountCredentialsForm({ initialMode = 'create', initialName = '', onDone }: { initialMode?: AccountMode; initialName?: string; onDone: () => void | Promise<void> }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const { account } = useServices()
  const [mode, setMode] = useState<AccountMode>(initialMode)
  const [email, setEmail] = useState('')
  const [name, setName] = useState(initialName)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'create') await account.register(email.trim(), name.trim(), password, await getDeviceId())
      else await account.signIn(email.trim(), password)
      await onDone()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_ALREADY_TAKEN') setError(t('account.emailTaken'))
      else if (err instanceof ApiError && (err.status === 401 || err.code === 'INVALID_CREDENTIALS')) setError(t('login.invalid'))
      else setError(describeError(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" aria-pressed={mode === 'create'} variant={mode === 'create' ? 'default' : 'outline'} onClick={() => setMode('create')} data-testid="account-mode-create">{t('account.create')}</Button>
        <Button type="button" aria-pressed={mode === 'signIn'} variant={mode === 'signIn' ? 'default' : 'outline'} onClick={() => setMode('signIn')} data-testid="account-mode-signin">{t('account.signIn')}</Button>
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
          {mode === 'create' ? t('account.create') : t('account.signIn')}
        </Button>
      </form>
    </>
  )
}
