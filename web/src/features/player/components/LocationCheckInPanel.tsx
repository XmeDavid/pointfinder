import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import { autoAccepts, distanceM, insideWideRing } from '@pointfinder/game-core'
import { Alert, Button, Card, CardContent } from '@/components'
import { useLocationStore } from '@/app/player/locationStore'
import { openLocationSettings } from '@/platform/geolocation'

type PanelState = 'locating' | 'denied' | 'unavailable' | 'far' | 'near' | 'arrived'

/**
 * Honest live feedback for a base that unlocks by position. The detector does the
 * actual check-in; this panel exists so waiting never feels broken, and it carries
 * the dwell-gated claim for the case where GPS never converges.
 */
export function LocationCheckInPanel({ baseId, base, onClaim, claimable, busy }: {
  baseId: string
  base: { lat: number; lng: number; radiusM: number }
  onClaim: () => void
  claimable: boolean
  busy: boolean
}) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const fix = useLocationStore((s) => s.fix)
  const status = useLocationStore((s) => s.status)

  let state: PanelState = 'locating'
  if (status === 'denied') state = 'denied'
  else if (status === 'unavailable' && !fix) state = 'unavailable'
  else if (fix) {
    if (autoAccepts(fix, base, base.radiusM).ok) state = 'arrived'
    else state = insideWideRing(fix, base, base.radiusM) ? 'near' : 'far'
  }

  const message =
    state === 'locating' ? t('location.locating')
      : state === 'denied' ? t('location.denied')
        : state === 'unavailable' ? t('location.unavailable')
          : state === 'arrived' ? t('location.arrived')
            : state === 'near' ? t('location.near', { accuracy: Math.round(fix!.accuracy) })
              : t('location.far', { meters: Math.round(distanceM(fix!, base)) })

  return (
    <Card data-testid="player-location-panel" data-base-id={baseId}>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium" role="status">{message}</p>
            {state === 'denied' && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => void openLocationSettings()}>
                {t('location.openSettings')}
              </Button>
            )}
          </div>
        </div>
        {state === 'arrived' && <Alert variant="info" className="bg-success/10 text-success">{t('checkIn.scanning')}</Alert>}
        <Button
          size="lg"
          variant="outline"
          className="w-full text-base"
          disabled={!claimable || busy}
          onClick={onClaim}
          data-testid="player-im-here-btn"
        >
          {t('checkIn.imHere')}
        </Button>
        {!claimable && <p className="text-xs text-muted-foreground">{t('checkIn.imHereHint')}</p>}
      </CardContent>
    </Card>
  )
}
