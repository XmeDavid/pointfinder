import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Nfc } from 'lucide-react'
import { Alert, Button, Card, CardContent, ConfirmDeleteDialog, Skeleton } from '@/components'
import { useAuth, useServices } from '@/app/player/services'
import { usePlayerGame } from '@/features/player/usePlayerGame'
import type { LogbookEntry } from '@/features/player/logbook'
import { nfcErrorMessage, scanTag } from '@/platform/nfc'
import { isNative } from '@/platform'
import { Screen } from '@/features/player/components/Screen'
import { BaseStatusBadge } from '@/features/player/components/BaseStatusBadge'
import { SyncBanner } from '@/features/player/components/SyncBanner'

/** The list view of the map: every visible base as a row with its status. Hidden bases stay unknown. */
export default function LogbookScreen() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const auth = useAuth()
  const { client } = useServices()
  const navigate = useNavigate()
  const game = usePlayerGame()
  const [scanError, setScanError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  if (auth.kind !== 'player') return null

  const status = game.snapshot?.game.status ?? auth.gameStatus
  const { logbook } = game

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

  return (
    <Screen
      bottomBar={
        isNative() ? (
          <Button size="lg" className="w-full text-base" onClick={tapAnyTag}>
            <Nfc className="mr-2 h-5 w-5" aria-hidden /> {t('logbook.tapAny')}
          </Button>
        ) : undefined
      }
    >
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {t('map.title')}</Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold leading-tight text-balance">{game.snapshot?.game.name ?? auth.gameName}</h1>
        <p className="text-sm text-muted-foreground">{auth.teamName} · {auth.displayName}</p>
        {logbook && (
          <div className="mt-2 flex items-center gap-3">
            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={logbook.summary.total} aria-valuenow={logbook.summary.completed}>
              <div className="h-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${logbook.summary.total ? (100 * logbook.summary.completed) / logbook.summary.total : 0}%` }} />
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{t('logbook.progress', { done: logbook.summary.completed, total: logbook.summary.total })}</span>
          </div>
        )}
      </header>

      <SyncBanner fromCache={game.fromCache} pending={game.pending} needsAuth={game.needsAuth} onRetry={(id) => void game.retry(id)} onDiscard={(id) => void game.discard(id)} />
      {scanError && <Alert variant="destructive">{scanError}</Alert>}
      {status === 'setup' && <Alert variant="info">{t('logbook.notLive')}</Alert>}
      {status === 'ended' && <Alert variant="info">{t('logbook.ended')}</Alert>}
      {game.error && !logbook && <Alert variant="destructive">{game.error.message}</Alert>}

      {game.isLoading && !logbook && (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
        </div>
      )}

      {logbook && logbook.entries.length > 1 && logbook.nextUp[0] && logbook.nextUp[0].kind === 'open' && (
        <section aria-label={t('logbook.nextUp')}>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('logbook.nextUp')}</p>
          <Link to={`/base/${encodeURIComponent(logbook.nextUp[0].baseId)}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <Card className="border-primary/40">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <span className="font-semibold">{logbook.nextUp[0].title || t('logbook.locked')}</span>
                <BaseStatusBadge status={logbook.nextUp[0].view.effectiveStatus} pendingSync={logbook.nextUp[0].view.pendingSync} />
              </CardContent>
            </Card>
          </Link>
        </section>
      )}

      {logbook && logbook.entries.length === 0 && <Alert variant="info">{t('logbook.empty')}</Alert>}

      {logbook && logbook.entries.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Bases">
          {logbook.entries.filter((e) => e.kind === 'open').map((e) => <LogbookRow key={e.baseId} entry={e} />)}
        </ul>
      )}

      <div className="mt-auto pt-4">
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setLeaving(true)}>{t('logbook.leave')}</Button>
        <ConfirmDeleteDialog
          open={leaving}
          title={t('logbook.leave')}
          description={t('logbook.leaveConfirm')}
          confirmLabel={t('logbook.leave')}
          variant="default"
          onCancel={() => setLeaving(false)}
          onConfirm={() => { setLeaving(false); void client.session.logout() }}
        />
      </div>
    </Screen>
  )
}

function LogbookRow({ entry }: { entry: LogbookEntry }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  if (entry.kind === 'locked') return null
  return (
    <li>
      <Link
        to={`/base/${encodeURIComponent(entry.baseId)}`}
        className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted"
      >
        <span className="font-medium leading-snug">{entry.title || t('challenge.noChallenge')}</span>
        <BaseStatusBadge status={entry.view.effectiveStatus} pendingSync={entry.view.pendingSync} />
      </Link>
    </li>
  )
}
