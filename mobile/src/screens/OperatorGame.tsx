import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { Alert, Badge, Card, CardContent, Skeleton } from '@pointfinder/core'
import { useServices } from '../app/services'
import { Screen } from '../components/Screen'

/** Placeholder command view: proves the operator snapshot end to end until operator mode is designed. */
export default function OperatorGame() {
  const { t } = useTranslation()
  const { gameId = '' } = useParams()
  const { client } = useServices()
  const snapshot = useQuery({ queryKey: ['operatorSnapshot', gameId], queryFn: () => client.api.games.snapshot(gameId), enabled: !!gameId, refetchInterval: 30_000 })
  const s = snapshot.data
  return (
    <Screen>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {t('common.back')}</Link>
      {snapshot.isLoading && <Skeleton className="h-24" />}
      {snapshot.error && <Alert variant="destructive">{(snapshot.error as Error).message}</Alert>}
      {s && (
        <>
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold leading-tight text-balance">{s.game.name}</h1>
            <div className="flex gap-2">
              <Badge variant={s.game.status === 'live' ? 'success' : s.game.status === 'setup' ? 'info' : 'secondary'}>{s.game.status}</Badge>
              <Badge variant={s.pendingReviews ? 'warning' : 'outline'}>{t('operator.pendingReviews')}: {s.pendingReviews}</Badge>
            </div>
          </header>
          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('operator.teams')}</p>
            <ul className="flex flex-col gap-2">
              {s.teams.map((team) => (
                <li key={team.id}>
                  <Card>
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <span className="flex items-center gap-2 font-medium"><span className="inline-block h-3 w-3 rounded-full border border-border" style={{ background: team.color ?? undefined }} aria-hidden />{team.name}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">{team.memberCount} · {team.score}</span>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Screen>
  )
}
