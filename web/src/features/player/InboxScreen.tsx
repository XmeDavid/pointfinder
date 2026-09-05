import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, ChevronLeft } from 'lucide-react'
import { useAuth, useServices } from '@/app/player/services'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components'
import { Screen } from '@/features/player/components/Screen'
import { relativeTime } from '@/features/player/relativeTime'

/** Messages from the operators: broadcasts to everyone and messages aimed at this team. */
export default function InboxScreen() {
  const { t, i18n } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const auth = useAuth()
  const { client } = useServices()
  const queries = useQueryClient()
  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => client.api.player.notifications(),
    enabled: auth.kind === 'player',
  })
  const markSeen = useMutation({
    mutationFn: () => client.api.player.markNotificationsSeen(),
    onSuccess: () => queries.setQueryData(['notifications', 'unseen'], { count: 0 }),
  })
  const { mutate: markAllSeen } = markSeen

  useEffect(() => {
    if (list.data && list.data.length > 0) markAllSeen()
  }, [list.data, markAllSeen])

  const [now] = useState(() => Date.now())
  const teamId = auth.kind === 'player' ? auth.teamId : null

  return (
    <Screen>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {t('map.title')}</Link>
      <h1 className="text-2xl font-semibold leading-tight">{t('inbox.title')}</h1>

      {list.isLoading && <LoadingState label={t('common.loading')} />}
      {list.error && <ErrorState title={t('inbox.loadFailed')} retryLabel={t('common.retry')} onRetry={() => void list.refetch()} />}
      {list.data && list.data.length === 0 && (
        <EmptyState icon={<Bell className="h-6 w-6" aria-hidden />} title={t('inbox.empty')} description={t('inbox.emptyHint')} />
      )}
      {list.data && list.data.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label={t('inbox.title')}>
          {[...list.data].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).map((n) => (
            <li key={n.id} className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="whitespace-pre-wrap break-words leading-snug">{n.message}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <time dateTime={n.sentAt}>{relativeTime(n.sentAt, now, i18n.resolvedLanguage ?? 'en', t('inbox.justNow'))}</time>
                {n.targetTeamId && n.targetTeamId === teamId && <Badge variant="info">{auth.kind === 'player' ? auth.teamName : ''}</Badge>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Screen>
  )
}
