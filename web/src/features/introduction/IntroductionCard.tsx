import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { INTRODUCTION_PLAY_ROUTE } from './progress'
import { useIntroductionProgress } from './useIntroductionProgress'

const STATUS = {
  none: { label: 'tutorials.introduction.status.none', variant: 'outline' },
  in_progress: { label: 'tutorials.introduction.status.none', variant: 'outline' },
  completed: { label: 'tutorials.introduction.status.completed', variant: 'success' },
  skipped: { label: 'tutorials.introduction.status.skipped', variant: 'secondary' },
} as const

/** "How PointFinder works" in the tutorials library: the introduction, always replayable. */
export function IntroductionCard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isSuccess } = useIntroductionProgress()
  const status = STATUS[data?.status ?? 'none']
  const watched = data?.status === 'completed'

  return (
    <Card data-testid="tutorial-introduction-card">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{t('tutorials.introduction.title')}</h2>
            {isSuccess && <Badge variant={status.variant} data-testid="tutorial-introduction-status">{t(status.label)}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{t('tutorials.introduction.blurb')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant={watched ? 'outline' : 'default'} onClick={() => navigate(INTRODUCTION_PLAY_ROUTE)} data-testid="tutorial-introduction-watch">
            {t(watched ? 'tutorials.introduction.watchAgain' : 'tutorials.introduction.watch')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
