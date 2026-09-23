import { useTranslation } from 'react-i18next'
import { Alert, Button } from '@/components'
import { requiresRescan, type PendingAction, type PendingMedia } from '@pointfinder/game-core'
import { describeFailedAction } from '@/app/player/errors'

/** One queued photo or video: how much of it the server already has (OW-10). */
function UploadRow({ item }: { item: PendingMedia }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const done = Boolean(item.fileUrl) || (item.size > 0 && item.uploadedBytes >= item.size)
  const percent = item.size > 0 ? Math.min(100, Math.floor((item.uploadedBytes / item.size) * 100)) : done ? 100 : 0
  const label = t('sync.uploadProgress', { name: item.name, percent })
  return (
    <li className="flex flex-col gap-1" data-testid={`upload-${item.id}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate">{item.name}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {done ? t('sync.uploadDone') : item.uploadedBytes > 0 ? `${percent}%` : t('sync.uploadWaiting')}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
    </li>
  )
}

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
  const uploads = pending.flatMap((a) => (a.type === 'submission' && a.state !== 'failed' ? a.media ?? [] : []))
  if (!fromCache && !pending.length && !needsAuth) return null
  return (
    <div className="flex flex-col gap-2">
      {fromCache && <Alert variant="warning">{t('sync.offline')}</Alert>}
      {needsAuth && <Alert variant="destructive">{t('sync.needsLogin')}</Alert>}
      {queued > 0 && (
        <Alert variant="info">
          <div className="flex flex-col gap-2">
            <span>{t('sync.pending', { count: queued })}</span>
            {uploads.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label={t('sync.uploads')} data-testid="sync-uploads">
                {uploads.map((item) => <UploadRow key={item.id} item={item} />)}
              </ul>
            )}
          </div>
        </Alert>
      )}
      {failed.map((a) => (
        <Alert key={a.id} variant="destructive">
          <div className="flex flex-col gap-2">
            <span>{a.lastErrorCode === 'PREVIOUS_BASE_REQUIRED' ? `${t('baseOrder.visitFirst', { number: a.lastErrorDetails?.nextRequiredBaseNumber ?? '?' })}. ${t('baseOrder.rescan')}` : a.lastErrorCode === 'PREVIOUS_CHECK_IN_FAILED' ? t('baseOrder.dependencyFailed') : describeFailedAction(a.lastErrorCode, a.lastErrorDetails, a.lastError, t)}</span>
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
