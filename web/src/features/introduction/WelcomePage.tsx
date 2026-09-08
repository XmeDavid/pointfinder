import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/player/services'
import { useAuthStore } from '@/lib/auth/store'
import { useGames } from '@/hooks/queries/useGames'
import { useTutorialProgress } from '@/hooks/queries/useTutorialProgress'
import { useTourStore } from '@/features/tutorials/store'
import { LoadingState } from '@/components/feedback/LoadingState'
import { OnboardingExperience } from '@/components/onboarding/OnboardingExperience'
import { isOnboardingRole, type OnboardingOutcome, type OnboardingRole } from '@/components/onboarding/useOnboarding'
import { DASHBOARD_ROUTE, isDecided, recordIntroduction, writeHandoff } from './progress'
import { useIntroductionProgress } from './useIntroductionProgress'

/**
 * `/welcome`, the one welcome world for everyone:
 *
 * - visitors choose a role; participating leads to joining, organizing to the
 *   account gate (create an account, sign in, or watch first). What an
 *   organizer watches or skips here is handed to the account they make next;
 * - a signed-in operator gets the tour offer, or the story itself with
 *   `?play=organizer` (after registration, or replayed from the tutorials
 *   library), and its landing hands off to the guided first game;
 * - a joined player gets the participant story with their game one tap away.
 */
export function WelcomePage() {
  const player = useAuth()
  const operator = useAuthStore((s) => s.isAuthenticated)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const [params] = useSearchParams()
  const play = params.get('play')

  if (!hasHydrated) return <LoadingState />
  if (operator) return <OperatorIntroduction play={play !== null} />
  if (player.kind === 'player') return <OnboardingExperience mode="player" play="participant" />
  return (
    <OnboardingExperience
      mode="anonymous"
      play={isOnboardingRole(play) ? play : undefined}
      organizerGate={params.get('role') === 'organizer'}
      onFinish={rememberForAccount}
    />
  )
}

/** Only the organizer story matters to the account a visitor may create next. */
function rememberForAccount(role: OnboardingRole, outcome: OnboardingOutcome): void {
  if (role === 'organizer') void writeHandoff(outcome)
}

function OperatorIntroduction({ play }: { play: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  const games = useGames()
  const tutorials = useTutorialProgress()
  const introduction = useIntroductionProgress()
  const startTour = useTourStore((s) => s.start)

  const record = useCallback((status: OnboardingOutcome) => {
    if (!userId) return
    void recordIntroduction(userId, status).finally(() => {
      void queryClient.invalidateQueries({ queryKey: ['tutorials', 'me'] })
    })
  }, [queryClient, userId])

  const onFinish = useCallback((_role: OnboardingRole, outcome: OnboardingOutcome) => {
    // A replay that is skipped part-way does not undo a completed introduction.
    if (outcome === 'skipped' && introduction.data?.status === 'completed') return
    record(outcome)
  }, [introduction.data?.status, record])

  const toDashboard = useCallback(() => navigate(DASHBOARD_ROUTE), [navigate])
  const onSkipTour = useCallback(() => {
    if (!isDecided(introduction.data?.status)) record('skipped')
    toDashboard()
  }, [introduction.data?.status, record, toDashboard])

  // The guided first game is offered exactly where the dashboard's welcome
  // card would: an empty dashboard with no first-game row. Nothing is created
  // until the operator chooses it, and the run then starts on the dashboard.
  const firstGameDone = tutorials.data?.some((row) => row.scenarioId === 'first-game') ?? true
  const canStartFirstGame = games.data !== undefined && games.data.length === 0 && tutorials.data !== undefined && !firstGameDone
  const onCreateFirstGame = useCallback(() => {
    startTour('first-game', { gamesAtStart: (games.data ?? []).map((game) => game.id) })
    toDashboard()
  }, [games.data, startTour, toDashboard])

  return (
    <OnboardingExperience
      mode="operator"
      play={play ? 'organizer' : undefined}
      onFinish={onFinish}
      operator={{ onSkipTour, onDashboard: toDashboard, onCreateFirstGame: canStartFirstGame ? onCreateFirstGame : undefined }}
    />
  )
}
