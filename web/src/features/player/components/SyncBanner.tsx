import { useTranslation } from 'react-i18next'
import { Alert, Button } from '@/components'
import { requiresRescan, type PendingAction } from '@pointfinder/game-core'

/** Offline, queued and failed states, always visible on player screens. */
export function SyncBanner({ fromCache, pending, needsAuth, onRetry, onDiscard }: {
  fromCache: boolean
  pending: PendingAction[]
  needsAuth: boolean
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
}) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const failed = pending.filter((a) => a.state === 'failed')
  const queued = pending.length - failed.length
  if (!fromCache && !pending.length && !needsAuth) return null
  return (
    <div className="flex flex-col gap-2">
      {fromCache && <Alert variant="warning">{t('sync.offline')}</Alert>}
      {needsAuth && <Alert variant="destructive">{t('sync.needsLogin')}</Alert>}
      {queued > 0 && <Alert variant="info">{t('sync.pending', { count: queued })}</Alert>}
      {failed.map((a) => (
        <Alert key={a.id} variant="destructive">
          <div className="flex flex-col gap-2">
            <span>{a.lastErrorCode === 'PREVIOUS_BASE_REQUIRED' ? `${t('baseOrder.visitFirst', { number: a.lastErrorDetails?.nextRequiredBaseNumber ?? '?' })}. ${t('baseOrder.rescan')}` : a.lastErrorCode === 'PREVIOUS_CHECK_IN_FAILED' ? t('baseOrder.dependencyFailed') : a.lastError ?? t('common.unknownError')}</span>
            <div className="flex gap-2">
              {!requiresRescan(a) && <Button size="sm" variant="outline" onClick={() => onRetry(a.id)}>{t('sync.retry')}</Button>}
              <Button size="sm" variant="ghost" onClick={() => onDiscard(a.id)}>{t('sync.discard')}</Button>
            </div>
          </div>
        </Alert>
      ))}
    </div>
  )
}
