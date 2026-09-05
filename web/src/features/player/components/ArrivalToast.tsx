import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Alert, buttonVariants, cn } from '@/components'
import { useArrivalNotices, type ArrivalNotice } from '@/app/player/arrivalNotices'

function title(notice: ArrivalNotice, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (!notice.title) return t('checkIn.foundUnknown')
  return notice.hidden ? t('checkIn.found', { name: notice.title }) : t('checkIn.arrived', { name: notice.title })
}

/**
 * App-wide arrival notices. Rendered once above the router outlet so a base that
 * unlocks while the player is on the map, the logbook, or another base is never missed.
 */
export function ArrivalToast() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const { notices, dismiss } = useArrivalNotices()
  if (!notices.length) return null
  return (
    <div className="safe-gutter pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+8px)] z-40 mx-auto flex w-full max-w-2xl flex-col gap-2">
      {notices.map((notice) => (
        <Alert
          key={notice.id}
          variant={notice.state === 'queued' ? 'warning' : 'info'}
          className={cn('pointer-events-auto shadow-overlay', notice.state === 'synced' && 'bg-success/10 text-success')}
          role="status"
          data-testid="player-arrival-notice"
          onDismiss={() => dismiss(notice.id)}
        >
          <div className="flex flex-col gap-1">
            <p className="font-medium">{title(notice, t)}</p>
            {notice.state === 'queued' && <p className="text-sm">{t('base.queued')}</p>}
            {notice.state === 'synced' && (
              <Link
                className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'w-fit p-0')}
                to={`/base/${encodeURIComponent(notice.baseId)}`}
                onClick={() => dismiss(notice.id)}
              >
                {t('map.open')}
              </Link>
            )}
          </div>
        </Alert>
      ))}
    </div>
  )
}
