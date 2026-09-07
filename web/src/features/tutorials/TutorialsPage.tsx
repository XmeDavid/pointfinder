import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/EmptyState'
import { useGames } from '@/hooks/queries/useGames'
import { useTutorialProgress } from '@/hooks/queries/useTutorialProgress'
import { useCreatePracticeGame, useUpdateTutorialProgress } from '@/hooks/mutations/useTutorialMutations'
import { useDeleteGame } from '@/hooks/mutations/useGameMutations'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api/errors'
import { useTourStore } from './store'
import { scenarioList } from './scenarios'
import { ScenarioCard } from './ScenarioCard'
import { activePracticeGame, isPracticeGame, readPracticeCentre } from './practiceGame'
import type { Scenario, ScenarioId, TutorialProgress } from './types'

const PRACTICE_NAME_KEY: Partial<Record<ScenarioId, string>> = {
  'fixed-route': 'tutorials.library.practice.gameName.fixedRoute',
  exploration: 'tutorials.library.practice.gameName.exploration',
  'unlock-chain': 'tutorials.library.practice.gameName.unlockChain',
  'different-path': 'tutorials.library.practice.gameName.differentPath',
  'variable-outcome': 'tutorials.library.practice.gameName.variableOutcome',
}

/**
 * The tutorials library. Every tutorial runs on a practice game: `new-game`
 * scenarios have the operator create it through the real dialog, and
 * `practice-game` scenarios get one created and seeded by the server here.
 * There is one practice game at a time, so starting while one exists asks
 * before replacing it.
 */
export function TutorialsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const progressQuery = useTutorialProgress()
  const { data: games, refetch: refetchGames } = useGames()
  const updateProgress = useUpdateTutorialProgress()
  const createPractice = useCreatePracticeGame()
  const deleteGame = useDeleteGame()
  const start = useTourStore((s) => s.start)

  const [error, setError] = useState<string | null>(null)

  const scenarios = scenarioList()
  const byId = new Map<ScenarioId, TutorialProgress>(
    (progressQuery.data ?? []).map((row) => [row.scenarioId, row]),
  )
  const practiceGame = activePracticeGame(games)

  /** The practice game a row is bound to, while it still exists and has not ended. */
  function boundPracticeGameId(scenario: Scenario, row: TutorialProgress | undefined): string | null {
    if (!row?.gameId) return null
    const game = (games ?? []).find((candidate) => candidate.id === row.gameId)
    if (!game || game.status === 'ended') return null
    return isPracticeGame(game) && game.tutorialScenario === scenario.id ? game.id : null
  }

  function startNewGameScenario(scenario: Scenario, resumeStepId: string | null) {
    // Same `start()` shape the welcome card uses: step 1 of `first-game`
    // recognises "the game the operator just created" against this snapshot.
    start(scenario.id, { gamesAtStart: (games ?? []).map((candidate) => candidate.id), stepId: resumeStepId })
    navigate('/dashboard')
  }

  async function createAndStart(scenario: Scenario, afterReplace = false) {
    setError(null)
    try {
      const centre = await readPracticeCentre()
      const game = await createPractice.mutateAsync({
        scenarioId: scenario.id,
        body: { name: t(PRACTICE_NAME_KEY[scenario.id] ?? 'tutorials.library.practice.gameName.generic'), ...centre },
      })
      start(scenario.id, { gameId: game.id, stepId: null })
      navigate(`/game/${game.id}`)
    } catch (err) {
      if (getApiErrorCode(err) === 'TUTORIAL_PRACTICE_GAME_EXISTS' && !afterReplace) {
        // The games list was stale (another tab or device made one): refresh
        // it and replace that game instead of a dead end. Once only: a second
        // refusal is shown, not retried.
        const fresh = await refetchGames()
        const stale = activePracticeGame(fresh.data)
        if (stale) {
          await deleteGame.mutateAsync(stale.id)
          await createAndStart(scenario, true)
          return
        }
      }
      setError(getApiErrorMessage(err, t('tutorials.library.practice.createFailed')))
    }
  }

  /**
   * Fresh start. A practice game is disposable by definition, so an existing
   * one is replaced without asking.
   */
  function fresh(scenario: Scenario, resumeStepId: string | null) {
    if (practiceGame) {
      void replaceAndStart(scenario, resumeStepId)
      return
    }
    if (scenario.entry === 'new-game') startNewGameScenario(scenario, resumeStepId)
    else void createAndStart(scenario)
  }

  function handleStart(scenario: Scenario) {
    fresh(scenario, null)
  }

  function handleResume(scenario: Scenario) {
    const row = byId.get(scenario.id)
    const stepId = row?.currentStep ?? null
    if (scenario.entry === 'new-game') {
      // A first-game run resumes into its practice game when it still exists;
      // otherwise it starts over from the dashboard.
      const gameId = boundPracticeGameId(scenario, row)
      if (gameId) {
        start(scenario.id, { gameId, stepId })
        navigate(`/game/${gameId}`)
        return
      }
      fresh(scenario, stepId)
      return
    }
    const gameId = boundPracticeGameId(scenario, row)
    if (gameId) {
      start(scenario.id, { gameId, stepId })
      navigate(`/game/${gameId}`)
      return
    }
    fresh(scenario, null)
  }

  function handleRestart(scenario: Scenario) {
    // The reset row lands before the run starts, so the write-through's own
    // PUT for the new run cannot be overtaken by it. A failed reset still
    // launches: the write-through retries the row on the next change.
    void updateProgress
      .mutateAsync({ scenarioId: scenario.id, status: 'in_progress', currentStep: null })
      .catch(() => undefined)
      .then(() => fresh(scenario, null))
  }

  async function replaceAndStart(scenario: Scenario, resumeStepId: string | null) {
    if (!practiceGame) return
    setError(null)
    try {
      await deleteGame.mutateAsync(practiceGame.id)
    } catch (err) {
      setError(getApiErrorMessage(err, t('tutorials.library.practice.createFailed')))
      return
    }
    if (scenario.entry === 'new-game') startNewGameScenario(scenario, resumeStepId)
    else await createAndStart(scenario)
  }

  const busy = createPractice.isPending || deleteGame.isPending

  return (
    <div className="safe-page h-full overflow-y-auto" data-testid="tutorials-page">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{t('tutorials.library.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('tutorials.library.subtitle')}</p>
        </header>

        {busy && (
          <p className="text-sm text-muted-foreground" role="status" data-testid="tutorials-practice-busy">
            {deleteGame.isPending ? t('tutorials.library.practice.replacing') : t('tutorials.library.practice.creating')}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert" data-testid="tutorials-practice-error">
            {error}
          </p>
        )}

        {progressQuery.isLoading ? (
          <div className="space-y-3" data-testid="tutorials-skeleton" aria-hidden="true">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : progressQuery.isError ? (
          <div data-testid="tutorials-error">
            <EmptyState
              title={t('tutorials.library.loadFailed')}
              action={
                <Button type="button" variant="outline" onClick={() => void progressQuery.refetch()} data-testid="tutorials-retry">
                  {t('tutorials.library.retry')}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                progress={byId.get(scenario.id)}
                onStart={() => handleStart(scenario)}
                onResume={() => handleResume(scenario)}
                onRestart={() => handleRestart(scenario)}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
