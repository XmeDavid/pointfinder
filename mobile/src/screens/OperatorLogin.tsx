import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useServices } from '../app/services'
import { describeError } from '../app/errors'
import { Alert, Button, Input, Label } from '@pointfinder/core'
import { Screen } from '../components/Screen'

export default function OperatorLogin() {
  const { t } = useTranslation()
  const { client } = useServices()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await client.api.auth.operatorLogin({ email: email.trim(), password })
      await client.session.setOperator(res)
      navigate('/', { replace: true })
    } catch (err) {
      setError(describeError(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Link className="text-sm text-muted-foreground" to="/">{t('common.back')}</Link>
      <h1 className="text-2xl font-semibold leading-tight text-balance">{t('login.title')}</h1>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-email">{t('login.email')}</Label>
          <Input id="f-email" className="h-12 text-base" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-password">{t('login.password')}</Label>
          <Input id="f-password" className="h-12 text-base" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {error && <Alert variant="destructive" role="alert">{error}</Alert>}
        <Button size="lg" type="submit" className="text-base" disabled={busy || !email || !password}>{t('login.signIn')}</Button>
      </form>
    </Screen>
  )
}
