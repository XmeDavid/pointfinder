import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useServices } from '../app/services'
import { getDeviceId } from '../app/device'
import { describeError } from '../app/errors'
import { Alert, Button, Input, Label } from '@pointfinder/core'
import { Screen } from '../components/Screen'

export default function Join() {
  const { t } = useTranslation()
  const { client } = useServices()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [joinCode, setJoinCode] = useState(params.get('code') ?? '')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const deviceId = await getDeviceId()
      const res = await client.api.auth.playerJoin({ joinCode: joinCode.trim(), displayName: displayName.trim(), deviceId })
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
      <Link className="text-sm text-muted-foreground" to="/">{t('common.back')}</Link>
      <h1 className="text-2xl font-semibold leading-tight text-balance">{t('join.title')}</h1>
      <p className="text-muted-foreground">{t('join.subtitle')}</p>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-codeLabel">{t('join.codeLabel')}</Label>
          <Input id="f-codeLabel" className="h-12 text-base" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} autoCapitalize="characters" autoCorrect="off" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-nameLabel">{t('join.nameLabel')}</Label>
          <Input id="f-nameLabel" className="h-12 text-base" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={40} />
        </div>
        {error && <Alert variant="destructive" role="alert">{error}</Alert>}
        <Button size="lg" type="submit" className="text-base" disabled={busy || !joinCode || !displayName}>{t('join.join')}</Button>
      </form>
    </Screen>
  )
}
