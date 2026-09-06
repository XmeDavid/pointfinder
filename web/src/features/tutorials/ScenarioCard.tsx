import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Scenario, TutorialProgress } from './types'

const STATUS_LABEL = {
  notStarted: 'tutorials.library.status.notStarted',
  in_progress: 'tutorials.library.status.inProgress',
  completed: 'tutorials.library.status.completed',
  skipped: 'tutorials.library.status.skipped',
} as const

const STATUS_VARIANT = {
  notStarted: 'outline',
  in_progress: 'info',
  completed: 'success',
  skipped: 'secondary',
} as const

export function ScenarioCard({
  scenario,
  progress,
  onStart,
  onResume,
  onRestart,
}: {
  scenario: Scenario
  progress?: TutorialProgress
  onStart: () => void
  onResume: () => void
  onRestart: () => void
}) {
  const { t } = useTranslation()
  const key = progress?.status ?? 'notStarted'

  return (
    <Card data-testid={`tutorial-card-${scenario.id}`}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{t(scenario.title)}</h2>
            <Badge variant={STATUS_VARIANT[key]} data-testid={`tutorial-status-${scenario.id}`}>
              {t(STATUS_LABEL[key])}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t(scenario.blurb)}</p>
          <p className="text-xs text-muted-foreground">
            {t('tutorials.library.stepCount', { count: scenario.steps.length })}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {progress?.status === 'in_progress' && (
            <Button type="button" onClick={onResume} data-testid={`tutorial-resume-${scenario.id}`}>
              {t('tutorials.library.resume')}
            </Button>
          )}
          {progress ? (
            <Button type="button" variant="outline" onClick={onRestart} data-testid={`tutorial-restart-${scenario.id}`}>
              {t('tutorials.library.restart')}
            </Button>
          ) : (
            <Button type="button" onClick={onStart} data-testid={`tutorial-start-${scenario.id}`}>
              {t('tutorials.library.start')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
