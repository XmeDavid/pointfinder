import { lazy, Suspense, useEffect } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth, useAccountSession } from './services'
import { useAuthStore } from '@/lib/auth/store'
import { isNativeEntry } from '@/platform/runtime'
import { LoadingState } from '@/components/feedback/LoadingState'
import { consumeResumeTarget, resumeTarget } from '@/app/resume'

const Join = lazy(() => import('@/features/player/Join'))
const Logbook = lazy(() => import('@/features/player/LogbookScreen'))
const Base = lazy(() => import('@/features/player/BaseScreen'))
const Settings = lazy(() => import('@/features/player/SettingsScreen'))
const Inbox = lazy(() => import('@/features/player/InboxScreen'))
const Documents = lazy(() => import('@/features/player/DocumentsScreen'))
const Document = lazy(() => import('@/features/player/DocumentScreen'))
const Account = lazy(() => import('@/features/player/AccountScreen'))
const Recover = lazy(() => import('@/features/player/RecoverScreen'))
const AccountSignIn = lazy(() => import('@/features/player/AccountSignInScreen'))
const Welcome = lazy(() => import('@/features/auth/Welcome'))
const PlayerMap = lazy(() => import('@/features/player/PlayerMap'))
const Landing = lazy(() => import('@/features/public/LandingPage').then((m) => ({ default: m.LandingPage })))

export function Home() {
  const auth = useAuth()
  const account = useAccountSession()
  const operator = useAuthStore((s) => s.isAuthenticated)
  const operatorId = useAuthStore((s) => (s.isAuthenticated ? (s.user?.id ?? null) : null))
  const nativeEntry = isNativeEntry()
  // OW-38: a cold start after the phone killed the app lands here; go back to
  // the screen the same session was on instead of Home. A launch deep link
  // navigates afterwards and therefore still wins; a sign-out cleared the record.
  const resume = resumeTarget({ userId: operatorId, playerId: auth.kind === 'player' ? auth.playerId : null, accountId: account.kind === 'operator' ? account.userId : null })
  useEffect(() => {
    if (resume) consumeResumeTarget()
  }, [resume])
  // Everyone is a player and an organizer now: any session opens on the one account home.
  let page = <Landing />
  if (resume) page = <Navigate to={resume} replace />
  else if (auth.kind === 'player' || operator || account.kind === 'operator') page = <Navigate to="/dashboard" replace />
  else if (nativeEntry) page = <Welcome />
  return <Suspense fallback={<LoadingState />}>{page}</Suspense>
}
function PlayerRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  if (auth.kind !== 'player') return <Navigate to="/join" replace />
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>
}
function JoinRoute({ children }: { children?: React.ReactNode }) {
  const auth = useAuth()
  const account = useAccountSession()
  const operator = useAuthStore(s=>s.isAuthenticated)
  if (!children && auth.kind === 'player' && account.kind !== 'operator' && !operator) return <Navigate to="/map" replace />
  return <Suspense fallback={<LoadingState />}>{children ?? <Join />}</Suspense>
}
function OperatorAlias() {
  const { gameId } = useParams()
  return <Navigate to={`/game/${encodeURIComponent(gameId ?? '')}`} replace />
}
// eslint-disable-next-line react-refresh/only-export-components
export const playerRoutes = [
  { path: '/join', element: <JoinRoute /> },
  { path: '/join/recover', element: <JoinRoute><Recover /></JoinRoute> },
  { path: '/join/account', element: <JoinRoute><AccountSignIn /></JoinRoute> },
  { path: '/map', element: <PlayerRoute><PlayerMap /></PlayerRoute> },
  { path: '/list', element: <PlayerRoute><Logbook /></PlayerRoute> },
  { path: '/base/:baseId', element: <PlayerRoute><Base /></PlayerRoute> },
  { path: '/settings', element: <PlayerRoute><Settings /></PlayerRoute> },
  { path: '/inbox', element: <PlayerRoute><Inbox /></PlayerRoute> },
  { path: '/documents', element: <PlayerRoute><Documents /></PlayerRoute> },
  { path: '/documents/:resourceId', element: <PlayerRoute><Document /></PlayerRoute> },
  { path: '/account', element: <PlayerRoute><Account /></PlayerRoute> },
  { path: '/operator/games/:gameId', element: <OperatorAlias /> },
]
