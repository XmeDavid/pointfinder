import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { QrCode } from 'lucide-react'
import { useServices } from '@/app/player/services'
import { getDeviceId } from '@/app/player/device'
import { describeError } from '@/app/player/errors'
import { Alert, Button, Input, Label } from '@/components'
import { isNative, kv } from '@/platform'
import { openScannerSettings, qrAvailable, scanQr } from '@/platform/qr'
import { Screen } from '@/features/player/components/Screen'
import { PermissionDisclosure } from '@/features/player/components/PermissionDisclosure'
import { QrScannerOverlay } from '@/features/player/components/QrScannerOverlay'
import { parseJoinCode } from '@/features/player/joinCode'

const DISCLOSURE_KEY = 'disclosureSeen'

type ScanError = { code: string; message: string }

export default function Join() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const { client } = useServices()
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
      const res = await client.api.auth.playerJoin({ joinCode: joinCode.trim().toUpperCase(), displayName: displayName.trim(), deviceId })
      await client.session.setPlayer(res)
      navigate('/', { replace: true })
    } catch (err) {
      setError(describeError(err, t))
    } finally {
      setBusy(false)
    }
  }

  if (disclosure === 'unknown') return <Screen>{null}</Screen>
  if (disclosure === 'show') return <PermissionDisclosure onContinue={() => void acceptDisclosure()} />
  if (scanning) return <QrScannerOverlay onBack={() => scanAbort.current?.abort()} />

  return (
    <Screen>
      <Link className="text-sm text-muted-foreground" to="/">{t('common.back')}</Link>
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
    </Screen>
  )
}
