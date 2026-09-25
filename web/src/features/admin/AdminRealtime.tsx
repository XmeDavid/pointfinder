import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { adminApi } from '@/lib/api/admin'
import { LoadingState } from '@/components/feedback/LoadingState'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'

/**
 * OW-23: realtime events an instance could not deliver before they expired.
 * Read-only on purpose: every event is a refresh signal, and players and
 * operators catch up from their next snapshot, so nothing is replayed here.
 */
export function AdminRealtime() {
  const { t, i18n } = useTranslation()
  const deadLetters = useQuery({ queryKey: ['admin', 'realtime', 'dead-letters'], queryFn: () => adminApi.realtimeDeadLetters() })
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div data-testid="admin-realtime">
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{t('admin.realtime.intro')}</p>
      {deadLetters.isPending && <LoadingState label={t('common.loading')} />}
      {deadLetters.isError && (
        <ErrorState title={t('admin.realtime.loadError')} retryLabel={t('common.retry')} onRetry={() => void deadLetters.refetch()} />
      )}
      {deadLetters.isSuccess && deadLetters.data.items.length === 0 && (
        <EmptyState density="compact" title={t('admin.realtime.empty')} />
      )}
      {deadLetters.isSuccess && deadLetters.data.items.length > 0 && (
        <>
          <p className="mb-2 text-sm font-medium">{t('admin.realtime.total', { count: deadLetters.data.total })}</p>
          <ul className="space-y-2">
            {deadLetters.data.items.map((item) => (
              <li key={`${item.instanceId}-${item.outboxId}`} className="rounded-lg border border-border px-4 py-3 text-sm" data-testid={`admin-dead-letter-${item.outboxId}`}>
                <p className="font-medium">
                  {item.eventType} · {item.audience}
                </p>
                <p className="text-xs text-muted-foreground break-all">
                  {t('admin.realtime.meta', { instance: item.instanceId, game: item.gameId, attempts: item.attempts, when: when(item.deadLetteredAt) })}
                </p>
                {item.lastError && <p className="mt-1 break-words font-mono text-xs text-destructive">{item.lastError}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
