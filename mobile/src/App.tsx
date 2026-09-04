import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router'
import { ServicesProvider, useAuth } from './app/services'
import Welcome from './screens/Welcome'
import Join from './screens/Join'
import OperatorLogin from './screens/OperatorLogin'
import PlayerMap from './screens/PlayerMap'
import LogbookScreen from './screens/LogbookScreen'
import OperatorHome from './screens/OperatorHome'
import OperatorGame from './screens/OperatorGame'
import BaseScreen from './screens/BaseScreen'
import { TagIntake } from './app/TagIntake'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } },
})

/** Routes by who is signed in. Guest routes bounce to home once a session exists and vice versa. */
function Gate({ need, children }: { need: 'guest' | 'player' | 'operator'; children: React.ReactNode }) {
  const auth = useAuth()
  const have = auth.kind === 'none' ? 'guest' : auth.kind
  if (have === need) return <>{children}</>
  return <Navigate to="/" replace />
}

function Root() {
  const auth = useAuth()
  if (auth.kind === 'player') return <PlayerMap />
  if (auth.kind === 'operator') return <OperatorHome />
  return <Welcome />
}

function Shell() {
  return (
    <>
      <TagIntake />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Root /> },
      { path: '/join', element: <Gate need="guest"><Join /></Gate> },
      { path: '/login', element: <Gate need="guest"><OperatorLogin /></Gate> },
      { path: '/list', element: <Gate need="player"><LogbookScreen /></Gate> },
      { path: '/base/:baseId', element: <Gate need="player"><BaseScreen /></Gate> },
      { path: '/operator/games/:gameId', element: <Gate need="operator"><OperatorGame /></Gate> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

function Splash() {
  return <main className="min-h-dvh grid place-items-center bg-background text-foreground"><h1 className="text-2xl font-semibold">PointFinder</h1></main>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ServicesProvider fallback={<Splash />}>
        <RouterProvider router={router} />
      </ServicesProvider>
    </QueryClientProvider>
  )
}
