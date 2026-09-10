import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useServices } from '@/app/player/services'
import { getDeviceId } from '@/app/player/device'
import { describeError } from '@/app/player/errors'
import { Alert, Button, Input, Label } from '@/components'
import { BrandLockup } from '@/components/brand'
import { Screen } from '@/features/player/components/Screen'
import { parseJoinCode } from '@/features/player/joinCode'

/** PF-01: a second phone gets the account's existing participation back. Credentials are used once. */
export default function RecoverScreen() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const { client } = useServices()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const deviceId = await getDeviceId()
      const code = parseJoinCode(joinCode) ?? joinCode.trim().toUpperCase()
      const res = await client.api.auth.playerRecover({ email: email.trim(), password, deviceId, joinCode: code })
      await client.session.setPlayer(res)
      navigate('/', { replace: true })
    } catch (err) {
      setError(describeError(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Link className="text-sm text-muted-foreground" to="/join">{t('common.back')}</Link>
      <BrandLockup size={22} className="text-sm" />
      <h1 className="text-2xl font-semibold leading-tight text-balance">{t('recover.title')}</h1>
      <p className="text-muted-foreground">{t('recover.subtitle')}</p>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="recover-email">{t('account.email')}</Label>
          <Input id="recover-email" type="email" className="h-12 text-base" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" data-testid="recover-email" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="recover-password">{t('account.password')}</Label>
          <Input id="recover-password" type="password" className="h-12 text-base" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={128} autoComplete="current-password" data-testid="recover-password" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="recover-code">{t('recover.codeLabel')}</Label>
          <Input id="recover-code" className="h-12 text-base uppercase" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} autoCapitalize="characters" autoCorrect="off" autoComplete="off" required data-testid="recover-code" />
        </div>
        {error && <Alert variant="destructive" role="alert">{error}</Alert>}
        <Button size="lg" type="submit" className="text-base" disabled={busy || !email.trim() || !password || !joinCode.trim()} data-testid="recover-submit">{t('recover.submit')}</Button>
      </form>
    </Screen>
  )
}
