import { BaseSequenceBadge } from '@/components/status/BaseSequenceBadge'
import { BaseRouteNotice } from './components/BaseRouteNotice'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Bell, List, LocateFixed, Nfc, QrCode, Settings } from 'lucide-react'
import { Alert, Badge, Button, StatusMarker, TeamLocationMarker, baseStatusMarkerTone, buttonVariants, cn, getResolvedStyleUrl } from '@/components'
import { useAuth } from '@/app/player/services'
import { usePlayerGame } from '@/features/player/usePlayerGame'
import { useTeamLocation } from '@/features/player/useTeamLocation'
import { useUnseenCount } from '@/features/player/useUnseenCount'
import type { LogbookEntry } from '@/features/player/logbook'
import { nfcErrorMessage, scanTag } from '@/platform/nfc'
import { isNative } from '@/platform'
import { BaseStatusBadge } from '@/features/player/components/BaseStatusBadge'
import { SyncBanner } from '@/features/player/components/SyncBanner'
import { parseTagUrl } from '@pointfinder/game-core'
import { scanQr } from '@/platform/qr'
import { QrScannerOverlay } from '@/features/player/components/QrScannerOverlay'
import { lightColorValues } from '@/generated/colorValues'
import { CHECK_IN_RADIUS_FILL_LAYER_ID, CHECK_IN_RADIUS_LINE_LAYER_ID, CHECK_IN_RADIUS_SOURCE_ID, radiusCollection } from '@/features/player/mapShapes'

const LEGEND = ['not_visited', 'checked_in', 'submitted', 'completed', 'rejected'] as const
const RADIUS_FILL = { id: CHECK_IN_RADIUS_FILL_LAYER_ID, type: 'fill' as const, paint: { 'fill-color': lightColorValues['status.checkedIn'], 'fill-opacity': 0.08 } }
const RADIUS_LINE = { id: CHECK_IN_RADIUS_LINE_LAYER_ID, type: 'line' as const, paint: { 'line-color': lightColorValues['status.checkedIn'], 'line-width': 1.5, 'line-opacity': 0.5 } }

/** The player's home: the game map with every visible base, the team's own position, and the tag button. */
export default function PlayerMap() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const auth = useAuth()
  const navigate = useNavigate()
  const game = usePlayerGame()
  const mapRef = useRef<MapRef | null>(null)
  const fitted = useRef(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const scanAbort = useRef<AbortController | null>(null)
  useEffect(() => () => scanAbort.current?.abort(), [])
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const status = game.snapshot?.game.status ?? (auth.kind === 'player' ? auth.gameStatus : 'setup')
  const location = useTeamLocation(game.gameId, status === 'live')
  const unseen = useUnseenCount()

  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const open = useMemo(() => (game.logbook?.entries.filter((e): e is Extract<LogbookEntry, { kind: 'open' }> => e.kind === 'open') ?? []), [game.logbook])
  // Hidden location bases arrive as geofence-only rows and must never be drawn.
  const radiusData = useMemo(
    () => radiusCollection(open.filter((e) => e.view.checkInMethod === 'LOCATION').map((e) => ({ baseId: e.baseId, lat: e.view.lat, lng: e.view.lng, radiusM: e.view.checkInRadiusM ?? 15 }))),
    [open],
  )
  const methods = useMemo(() => new Set((game.data?.bases ?? []).map((b) => b.checkInMethod ?? 'NFC')), [game.data])
  const hasNfcBases = methods.has('NFC')
  const hasQrBases = methods.has('QR')
  const hasLocationBases = methods.has('LOCATION')
  const tileSource = game.snapshot?.game.tileSource ?? (auth.kind === 'player' ? auth.tileSource : null)
  const styleUrl = getResolvedStyleUrl(tileSource === 'osm-classic' ? 'osm' : tileSource, dark)

  const fitToBases = useCallback(() => {
    const map = mapRef.current
    if (!map || open.length === 0) return
    const lngs = open.map((e) => e.view.lng)
    const lats = open.map((e) => e.view.lat)
    if (open.length === 1) map.flyTo({ center: [lngs[0]!, lats[0]!], zoom: 16, duration: 600 })
    else map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 140, bottom: 220, left: 40, right: 40 }, duration: 600 })
  }, [open])

  useEffect(() => {
    if (fitted.current || open.length === 0 || !mapRef.current) return
    fitted.current = true
    fitToBases()
  }, [open, fitToBases])

  async function tapAnyTag() {
    setScanError(null)
    try {
      const { tag } = await scanTag(t)
      if (!tag) return setScanError(t('nfc.invalid'))
      navigate(`/base/${encodeURIComponent(tag.baseId)}?token=${encodeURIComponent(tag.token ?? '')}`)
    } catch (err) {
      setScanError(nfcErrorMessage(err, t))
    }
  }

  async function scanAnyCode() {
    setScanError(null)
    scanAbort.current?.abort()
    const controller = new AbortController()
    scanAbort.current = controller
    setScanning(true)
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const text = await scanQr({ signal: controller.signal, windowed: true })
      if (text === null) return
      const tag = parseTagUrl(text)
      if (!tag) return setScanError(t('base.unknownTag'))
      navigate(`/base/${encodeURIComponent(tag.baseId)}?token=${encodeURIComponent(tag.token ?? '')}`)
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'failed'
      setScanError(code === 'denied' ? t('join.cameraDisabled') : code === 'unavailable' ? t('join.scanUnavailable') : t('common.unknownError'))
    } finally {
      if (scanAbort.current === controller) scanAbort.current = null
      setScanning(false)
    }
  }

  const selectedEntry = open.find((e) => e.baseId === selected) ?? null
  if (auth.kind !== 'player') return null

  if (scanning) return <QrScannerOverlay onBack={() => scanAbort.current?.abort()} caption={t('checkIn.scanQr')} testId="player-map-qr-scanner" />

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[var(--pf-color-surface-map)] text-foreground">
      <Map
        ref={(r) => { mapRef.current = r; if (r && !fitted.current && open.length) { fitted.current = true; fitToBases() } }}
        initialViewState={{ longitude: open[0]?.view.lng ?? -8.87, latitude: open[0]?.view.lat ?? 40.09, zoom: 14 }}
        mapStyle={styleUrl}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        onClick={() => setSelected(null)}
      >
        {radiusData.features.length > 0 && (
          <Source id={CHECK_IN_RADIUS_SOURCE_ID} type="geojson" data={radiusData}>
            <Layer {...RADIUS_FILL} />
            <Layer {...RADIUS_LINE} />
          </Source>
        )}
        {open.map((e) => (
          <Marker key={e.baseId} longitude={e.view.lng} latitude={e.view.lat} anchor="center" onClick={(ev) => { ev.originalEvent.stopPropagation(); setSelected(e.baseId) }}>
            <button type="button" className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${e.view.sequenceNumber ? `${t('baseOrder.baseNumber', { number: e.view.sequenceNumber, keyPrefix: '' })} · ` : ''}${e.title || t('challenge.noChallenge')}: ${t(`status.${e.view.effectiveStatus}`)}`}>
              <BaseSequenceBadge sequenceNumber={e.view.sequenceNumber} />
              <StatusMarker tone={baseStatusMarkerTone[e.view.effectiveStatus]} size={e.baseId === selected ? 18 : 14} selected={e.baseId === selected} label={e.title || undefined} />
            </button>
          </Marker>
        ))}
        {location.fix && (
          <Marker longitude={location.fix.lng} latitude={location.fix.lat} anchor="center">
            <TeamLocationMarker heading={location.heading} />
          </Marker>
        )}
      </Map>

      {/* Header */}
      <div className="safe-gutter pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 pt-[calc(var(--safe-top)+8px)]">
        <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-lg border border-border bg-card/95 px-4 py-2.5 shadow-overlay backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight">{game.snapshot?.game.name ?? auth.gameName}</h1>
            <p className="truncate text-xs text-muted-foreground">{auth.teamName}{game.logbook ? ` · ${t('logbook.progress', { done: game.logbook.summary.completed, total: game.logbook.summary.total })}` : ''}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {status === 'live' && <Badge variant="success">live</Badge>}
            <Link to="/inbox" className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'relative')} aria-label={unseen > 0 ? `${t('map.inbox')} (${unseen})` : t('map.inbox')} data-testid="player-inbox-btn">
              <Bell className="h-5 w-5" aria-hidden />
              {unseen > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-destructive-foreground" aria-hidden>{unseen > 9 ? '9+' : unseen}</span>}
            </Link>
            <Link to="/list" className={cn(buttonVariants({ variant: 'outline', size: 'icon' }))} aria-label={t('map.list')}><List className="h-5 w-5" aria-hidden /></Link>
            <Link to="/settings" className={cn(buttonVariants({ variant: 'outline', size: 'icon' }))} aria-label={t('map.settings')} data-testid="player-settings-btn"><Settings className="h-5 w-5" aria-hidden /></Link>
          </div>
        </div>
        <div className="pointer-events-auto">
          <SyncBanner fromCache={game.fromCache} pending={game.pending} needsAuth={game.needsAuth} onRetry={(id) => void game.retry(id)} onDiscard={(id) => void game.discard(id)} />
        </div>
        <div className="pointer-events-auto"><BaseRouteNotice route={game.route} logbook={game.logbook} /></div>
        {scanError && <Alert variant="destructive" className="pointer-events-auto">{scanError}</Alert>}
        {game.error && !game.logbook && <Alert variant="destructive" className="pointer-events-auto">{game.error.message}</Alert>}
        {game.logbook && open.length === 0 && <Alert variant="info" className="pointer-events-auto">{t('map.noBases')}</Alert>}
        {location.status === 'denied' && status === 'live' && <Alert variant="warning" className="pointer-events-auto">{t('map.locationOff')}</Alert>}
        {location.status === 'denied' && status === 'live' && hasLocationBases && (
          <Alert variant="warning" className="pointer-events-auto" data-testid="player-map-location-warning">{t('location.basesWontUnlock')}</Alert>
        )}
      </div>

      {/* Not live: scrim + message, like the old app */}
      {status !== 'live' && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--pf-color-surface-scrim)] px-6">
          <div className="rounded-lg border border-border bg-card p-5 text-center shadow-modal">
            <p className="font-semibold">{status === 'ended' ? t('logbook.ended') : t('logbook.notLive')}</p>
          </div>
        </div>
      )}

      {/* Bottom: selected base card, legend, actions */}
      <div className="safe-gutter absolute inset-x-0 bottom-0 flex flex-col gap-2 pb-[calc(var(--safe-bottom)+12px)]">
        {selectedEntry && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-overlay backdrop-blur" role="dialog" aria-label={selectedEntry.title}>
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold"><BaseSequenceBadge sequenceNumber={selectedEntry.view.sequenceNumber} />{selectedEntry.title || t('challenge.noChallenge')}</p>
              <BaseStatusBadge status={selectedEntry.view.effectiveStatus} pendingSync={selectedEntry.view.pendingSync} />
            </div>
            <Link to={`/base/${encodeURIComponent(selectedEntry.baseId)}`} className={cn(buttonVariants({ size: 'sm' }))}>{t('map.open')}</Link>
          </div>
        )}
        <div className="flex items-end justify-between gap-2">
          <ul className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs backdrop-blur" aria-label={t('map.legend')}>
            {LEGEND.map((s) => (
              <li key={s} className="flex items-center gap-1"><StatusMarker tone={baseStatusMarkerTone[s]} size={8} /><span>{t(`status.${s}`)}</span></li>
            ))}
          </ul>
          <Button variant="outline" size="icon" aria-label={t('map.locate')} onClick={() => { const f = location.fix; if (f && mapRef.current) mapRef.current.flyTo({ center: [f.lng, f.lat], zoom: 16, duration: 500 }); else fitToBases() }}>
            <LocateFixed className="h-5 w-5" aria-hidden />
          </Button>
        </div>
        {/* The scan control offers only the methods this game actually uses. */}
        {isNative() && (hasNfcBases || hasQrBases) && (
          <div className="flex flex-col gap-2">
            {hasNfcBases && (
              <Button size="lg" className="w-full text-base shadow-overlay" onClick={tapAnyTag}>
                <Nfc className="mr-2 h-5 w-5" aria-hidden /> {t('logbook.tapAny')}
              </Button>
            )}
            {hasQrBases && (
              <Button size="lg" variant={hasNfcBases ? 'outline' : 'default'} className="w-full text-base shadow-overlay" onClick={() => void scanAnyCode()} data-testid="player-map-scan-qr-btn">
                <QrCode className="mr-2 h-5 w-5" aria-hidden /> {t('checkIn.scanQr')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
