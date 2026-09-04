import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Skeleton } from '@pointfinder/core'
import { useAuth, useServices } from '../app/services'
import { Screen } from '../components/Screen'

const TONE = { setup: 'info', live: 'success', ended: 'secondary' } as const

/** Operator entry: the games this operator can run. The operator experience is designed after player mode. */
export default function OperatorHome() {
  const { t } = useTranslation()
  const auth = useAuth()
  const { client } = useServices()
  const games = useQuery({ queryKey: ['games'], queryFn: () => client.api.games.list(), enabled: auth.kind === 'operator' })
  if (auth.kind !== 'operator') return null
  return (
    <Screen>
      <header>
        <h1 className="text-2xl font-semibold">{t('operator.games')}</h1>
        <p className="text-sm text-muted-foreground">{auth.userName}</p>
      </header>
      {games.isLoading && <div className="flex flex-col gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
      {games.error && <Alert variant="destructive">{(games.error as Error).message}</Alert>}
      {games.data?.length === 0 && <Alert variant="info">{t('operator.noGames')}</Alert>}
      {games.data && games.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {games.data.map((g) => (
            <li key={g.id}>
              <Link to={`/operator/games/${encodeURIComponent(g.id)}`} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="font-medium">{g.name}</span>
                <Badge variant={TONE[g.status] ?? 'outline'}>{g.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-4">
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => void client.session.logout()}>{t('operator.signOut')}</Button>
      </div>
    </Screen>
  )
}
