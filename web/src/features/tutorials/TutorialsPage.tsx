import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/EmptyState'
import { useGames } from '@/hooks/queries/useGames'
import { useTutorialProgress } from '@/hooks/queries/useTutorialProgress'
import { useUpdateTutorialProgress } from '@/hooks/mutations/useTutorialMutations'
import { useTourStore } from './store'
import { scenarioList } from './scenarios'
import { ScenarioCard } from './ScenarioCard'
import { SetupGamePicker } from './SetupGamePicker'
import type { Scenario, ScenarioId, TutorialProgress } from './types'

export function TutorialsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const progressQuery = useTutorialProgress()
  const { data: games } = useGames()
  const updateProgress = useUpdateTutorialProgress()
  const start = useTourStore((s) => s.start)

  const [pickerFor, setPickerFor] = useState<{ scenario: Scenario; resumeStepId: string | null } | null>(null)

  const scenarios = scenarioList()
  const byId = new Map<ScenarioId, TutorialProgress>(
    (progressQuery.data ?? []).map((row) => [row.scenarioId, row]),
  )

  /** A bound game is usable only while it still exists and is still in setup. */
  function usableGameId(gameId: string | null | undefined): string | null {
    if (!gameId) return null
    const game = (games ?? []).find((candidate) => candidate.id === gameId)
    return game && game.status === 'setup' ? game.id : null
  }

  function launch(scenario: Scenario, gameId: string | null, resumeStepId: string | null) {
    if (scenario.entry === 'new-game') {
      // Same `start()` shape the welcome card uses: step 1 of `first-game`
      // recognises "the game the operator just created" against this snapshot.
      start(scenario.id, { gamesAtStart: (games ?? []).map((candidate) => candidate.id), stepId: resumeStepId })
      navigate('/dashboard')
      return
    }
    if (!gameId) {
      setPickerFor({ scenario, resumeStepId })
      return
    }
    start(scenario.id, { gameId, stepId: resumeStepId })
    navigate(`/game/${gameId}`)
  }

  function handleStart(scenario: Scenario) {
    launch(scenario, null, null)
  }

  function handleResume(scenario: Scenario) {
    const row = byId.get(scenario.id)
    launch(scenario, usableGameId(row?.gameId), row?.currentStep ?? null)
  }

  function handleRestart(scenario: Scenario) {
    // The reset row lands before the run starts, so the write-through's own
    // PUT for the new run cannot be overtaken by it. A failed reset still
    // launches: the write-through retries the row on the next change.
    void updateProgress
      .mutateAsync({ scenarioId: scenario.id, status: 'in_progress', currentStep: null })
      .catch(() => undefined)
      .then(() => launch(scenario, null, null))
  }

  return (
    <div className="safe-page h-full overflow-y-auto" data-testid="tutorials-page">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{t('tutorials.library.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('tutorials.library.subtitle')}</p>
        </header>

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

      <SetupGamePicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onPick={(gameId) => {
          const target = pickerFor
          setPickerFor(null)
          if (target) launch(target.scenario, gameId, target.resumeStepId)
        }}
      />
    </div>
  )
}
