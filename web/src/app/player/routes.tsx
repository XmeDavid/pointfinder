import { lazy, Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from './services'
import { useAuthStore } from '@/lib/auth/store'
import { isNativeEntry } from '@/platform/runtime'
import { LoadingState } from '@/components/feedback/LoadingState'

const PlayerMap = lazy(() => import('@/features/player/PlayerMap'))
const Join = lazy(() => import('@/features/player/Join'))
const Logbook = lazy(() => import('@/features/player/LogbookScreen'))
const Base = lazy(() => import('@/features/player/BaseScreen'))
const Settings = lazy(() => import('@/features/player/SettingsScreen'))
const Inbox = lazy(() => import('@/features/player/InboxScreen'))
const Welcome = lazy(() => import('@/features/auth/Welcome'))
const Landing = lazy(() => import('@/features/public/LandingPage').then((m) => ({ default: m.LandingPage })))

export function Home() {
  const auth = useAuth()
  const operator = useAuthStore((s) => s.isAuthenticated)
  const nativeEntry = isNativeEntry()
  let page = <Landing />
  if (operator && nativeEntry) page = <Navigate to="/dashboard" replace />
  else if (!operator && auth.kind === 'player') page = <PlayerMap />
  else if (!operator && nativeEntry) page = <Welcome />
  return <Suspense fallback={<LoadingState />}>{page}</Suspense>
}
function PlayerRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const operator = useAuthStore((s) => s.isAuthenticated)
  if (operator) return <Navigate to="/dashboard" replace />
  if (auth.kind !== 'player') return <Navigate to="/join" replace />
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>
}
function JoinRoute() {
  const auth = useAuth()
  const operator = useAuthStore((s) => s.isAuthenticated)
  if (operator) return <Navigate to="/dashboard" replace />
  if (auth.kind === 'player') return <Navigate to="/" replace />
  return <Suspense fallback={<LoadingState />}><Join /></Suspense>
}
function OperatorAlias() {
  const { gameId } = useParams()
  return <Navigate to={`/game/${encodeURIComponent(gameId ?? '')}`} replace />
}
// eslint-disable-next-line react-refresh/only-export-components
export const playerRoutes = [
  { path: '/join', element: <JoinRoute /> },
  { path: '/list', element: <PlayerRoute><Logbook /></PlayerRoute> },
  { path: '/base/:baseId', element: <PlayerRoute><Base /></PlayerRoute> },
  { path: '/settings', element: <PlayerRoute><Settings /></PlayerRoute> },
  { path: '/inbox', element: <PlayerRoute><Inbox /></PlayerRoute> },
  { path: '/operator/games/:gameId', element: <OperatorAlias /> },
]
