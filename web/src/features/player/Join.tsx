import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { QrCode } from 'lucide-react'
import { useAccountSession, useServices } from '@/app/player/services'
import { getDeviceId } from '@/app/player/device'
import { describeError } from '@/app/player/errors'
import { Alert, Button, Input, Label } from '@/components'
import { isNative, kv } from '@/platform'
import { openScannerSettings, qrAvailable, scanQr } from '@/platform/qr'
import { BrandLockup } from '@/components/brand'
import { Screen } from '@/features/player/components/Screen'
import { PermissionDisclosure } from '@/features/player/components/PermissionDisclosure'
import { QrScannerOverlay } from '@/features/player/components/QrScannerOverlay'
import { useAuthStore } from '@/lib/auth/store'
import apiClient from '@/lib/api/client'
import type { PlayerAuthResponse } from '@pointfinder/api'
import { parseJoinCode } from '@/features/player/joinCode'

const DISCLOSURE_KEY = 'disclosureSeen'

type ScanError = { code: string; message: string }

export default function Join() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const { client, account } = useServices()
  const session = useAccountSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [joinCode, setJoinCode] = useState(() => parseJoinCode(params.get('code')) ?? params.get('code') ?? '')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanError, setScanError] = useState<ScanError | null>(null)
  const [scanning, setScanning] = useState(false)
  const [disclosure, setDisclosure] = useState<'unknown' | 'show' | 'done'>(() => (isNative() ? 'unknown' : 'done'))
  const scanAbort = useRef<AbortController | null>(null)

  // Phones see the permission explanation once, before any system prompt can appear.
  useEffect(() => {
    if (disclosure !== 'unknown') return
    let alive = true
    kv.get(DISCLOSURE_KEY).then((v) => alive && setDisclosure(v ? 'done' : 'show')).catch(() => alive && setDisclosure('done'))
    return () => { alive = false }
  }, [disclosure])

  useEffect(() => () => scanAbort.current?.abort(), [])

  async function acceptDisclosure() {
    setDisclosure('done')
    await kv.set(DISCLOSURE_KEY, new Date().toISOString()).catch(() => {})
  }

  async function scan() {
    setScanError(null)
    scanAbort.current?.abort()
    const controller = new AbortController()
    scanAbort.current = controller
    setScanning(true)
    try {
      // Let React replace the opaque join screen before the native camera makes
      // the webview transparent and starts delivering frames underneath it.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const text = await scanQr({ signal: controller.signal, windowed: true })
      if (text === null) return
      const code = parseJoinCode(text)
      if (!code) return setScanError({ code: 'invalid', message: t('join.invalidQr') })
      setJoinCode(code)
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'failed'
      setScanError({ code, message: code === 'denied' ? t('join.cameraDisabled') : code === 'unavailable' ? t('join.scanUnavailable') : t('common.unknownError') })
    } finally {
      if (scanAbort.current === controller) scanAbort.current = null
      setScanning(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const deviceId = await getDeviceId()
      const body = { joinCode: joinCode.trim().toUpperCase(), displayName: displayName.trim(), deviceId }
      // A signed-in phone joins as its account: it gets its own participation back
      // if the account already plays this game, and never becomes a second competitor.
      const res = session.kind === 'operator' ? await account.api.account.join(body) : useAuthStore.getState().isAuthenticated ? (await apiClient.post<PlayerAuthResponse>('/account/join',body)).data : await client.api.auth.playerJoin(body)
      await client.session.setPlayer(res)
      navigate('/map', { replace: true })
    } catch (err) {
      setError(describeError(err, t))
    } finally {
      setBusy(false)
    }
  }

  if (disclosure === 'unknown') return <Screen>{null}</Screen>
  if (disclosure === 'show') return <PermissionDisclosure onContinue={() => void acceptDisclosure()} />
  if (scanning) return <QrScannerOverlay onBack={() => scanAbort.current?.abort()} caption={t('join.scanQr')} />

  return (
    <Screen>
      <Link className="inline-flex min-h-11 items-center text-sm text-muted-foreground" to={session.kind === "operator" || useAuthStore.getState().isAuthenticated ? "/dashboard" : "/"}>{t('common.back')}</Link>
      <BrandLockup size={22} className="text-sm" />
      <h1 className="text-2xl font-semibold leading-tight text-balance">{t('join.title')}</h1>
      <p className="text-muted-foreground">{t('join.subtitle')}</p>
      {qrAvailable() && (
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" size="lg" className="text-base" onClick={() => void scan()} data-testid="player-join-scan-btn">
            <QrCode className="mr-2 h-5 w-5" aria-hidden /> {t('join.scanQr')}
          </Button>
          {scanError && (
            <Alert variant="warning" role="alert">
              {scanError.message}
              {scanError.code === 'denied' && (
                <Button type="button" variant="link" size="sm" className="ml-1 h-auto p-0" onClick={() => void openScannerSettings()}>{t('join.openSettings')}</Button>
              )}
            </Alert>
          )}
          <p className="text-center text-xs text-muted-foreground">{t('join.orEnterCode')}</p>
        </div>
      )}
      {session.kind === 'operator' && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3" data-testid="join-signed-in">
          <span className="min-w-0 text-sm"><span className="text-muted-foreground">{t('account.joinAs')}</span> <span className="block truncate font-medium">{session.email}</span></span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void account.signOut()} data-testid="join-sign-out">{t('account.signOut')}</Button>
        </div>
      )}
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-codeLabel">{t('join.codeLabel')}</Label>
          <Input id="f-codeLabel" className="h-12 text-base uppercase" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} autoCapitalize="characters" autoCorrect="off" autoComplete="off" inputMode="text" required data-testid="player-join-code-input" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-nameLabel">{t('join.nameLabel')}</Label>
          <Input id="f-nameLabel" className="h-12 text-base" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={40} autoComplete="name" data-testid="player-join-name-input" />
        </div>
        {error && <Alert variant="destructive" role="alert">{error}</Alert>}
        <Button size="lg" type="submit" className="text-base" disabled={busy || !joinCode.trim() || !displayName.trim()} data-testid="player-join-submit-btn">{t('join.join')}</Button>
      </form>
      {session.kind === 'operator' ? (
        <>
          <p className="text-center text-xs text-muted-foreground">{t('join.signedInHint')}</p>
          <Link to="/join/recover" className="text-center text-sm text-primary underline" data-testid="player-join-recover-link">{t('account.myGames')}</Link>
        </>
      ) : (
        <>
          <Link to="/join/account?mode=signIn&next=/join" className="text-center text-sm text-primary underline" data-testid="player-join-sign-in-link">{t('account.orSignIn')}</Link>
          <Link to="/join/account?next=/join" className="text-center text-sm text-primary underline" data-testid="player-join-create-link">{t('account.orCreate')}</Link>
          <Link to="/join/recover" className="text-center text-sm text-primary underline" data-testid="player-join-recover-link">{t('recover.link')}</Link>
        </>
      )}
    </Screen>
  )
}
