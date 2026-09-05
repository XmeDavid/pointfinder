import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { BaseRoute } from '@pointfinder/game-core'
import { Alert, buttonVariants } from '@/components'
import type { Logbook } from '@/features/player/logbook'

/** Only visible progress can provide a recovery link, title, or destination. */
export function BaseRouteNotice({ route, logbook, missingNumber, rescanRequired = false }: {
  route: BaseRoute | undefined
  logbook: Logbook | null
  missingNumber?: number | null
  rescanRequired?: boolean
}) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  if (!route?.enabled && missingNumber == null) return null
  const number = missingNumber ?? route?.nextRequiredBaseNumber
  if (number === undefined) return null
  const target = logbook?.entries.find((e) => e.kind === 'open' && e.view.sequenceNumber === number)
  // We cannot infer another hidden base beyond the locally advanced frontier.
  if (missingNumber == null && !target && route?.provisionalCheckInIds.length) return null
  return (
    <Alert variant={missingNumber != null ? 'warning' : 'info'} role="status" data-testid="player-base-route">
      <p className="font-medium">{number === null ? t('baseOrder.complete') : t(missingNumber != null ? 'baseOrder.visitFirst' : 'baseOrder.next', { number })}{missingNumber == null && target?.kind === 'open' && target.title ? ` · ${target.title}` : ''}</p>
      {missingNumber != null && <p className="mt-1 text-sm">{t('baseOrder.explanation', { number })}</p>}
      {rescanRequired && <p className="mt-1 text-sm">{t('baseOrder.rescan')}</p>}
      {target && <Link className={buttonVariants({ variant: 'link', size: 'sm' })} to={`/base/${encodeURIComponent(target.baseId)}`}>{t('baseOrder.showBase', { number })}</Link>}
    </Alert>
  )
}
