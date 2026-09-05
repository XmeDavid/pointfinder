import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, CloudOff, XCircle } from 'lucide-react'
import { Alert, buttonVariants, cn } from '@/components'
import { RichContent } from '@/features/player/components/RichContent'

export type SubmissionOutcome = 'correct' | 'approved' | 'pending' | 'rejected' | 'queued'

export interface SubmissionResultProps {
  outcome: SubmissionOutcome
  feedback?: string | null
  /** Shown only for correct/approved outcomes, like the old app's "Unlocked information". */
  completionContent?: string | null
  unlockedCount?: number
}

const TONE: Record<SubmissionOutcome, { variant: 'info' | 'warning' | 'destructive'; className?: string; icon: typeof CheckCircle2 }> = {
  correct: { variant: 'info', className: 'bg-success/10 text-success border-success/30', icon: CheckCircle2 },
  approved: { variant: 'info', className: 'bg-success/10 text-success border-success/30', icon: CheckCircle2 },
  pending: { variant: 'info', icon: Clock },
  rejected: { variant: 'destructive', icon: XCircle },
  queued: { variant: 'warning', icon: CloudOff },
}

const TITLE: Record<SubmissionOutcome, string> = { correct: 'result.correct', approved: 'result.approved', pending: 'result.submitted', rejected: 'result.rejected', queued: 'result.queued' }
const MESSAGE: Record<SubmissionOutcome, string> = { correct: 'result.correctMsg', approved: 'result.approvedMsg', pending: 'result.submittedMsg', rejected: 'result.rejectedMsg', queued: 'result.queuedMsg' }

/** What happened to the answer, in the words the old app used, plus the way back to the map. */
export function SubmissionResult({ outcome, feedback, completionContent, unlockedCount = 0 }: SubmissionResultProps) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const tone = TONE[outcome]
  const Icon = tone.icon
  const showUnlocked = (outcome === 'correct' || outcome === 'approved') && !!completionContent?.trim()
  return (
    <section className="flex flex-col gap-3" role="status" aria-live="polite" data-testid="player-submission-result">
      <Alert variant={tone.variant} className={cn('flex items-start gap-3', tone.className)}>
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-semibold" data-testid="player-submission-status">{t(TITLE[outcome])}</p>
          <p className="text-sm">{t(MESSAGE[outcome])}</p>
          {feedback && <p className="text-sm">{t('result.feedback', { feedback })}</p>}
        </div>
      </Alert>
      {unlockedCount > 0 && <Alert variant="info" className="bg-success/10 text-success border-success/30">{t('base.unlocked', { count: unlockedCount })}</Alert>}
      {showUnlocked && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">{t('result.unlockedInformation')}</h3>
          <RichContent html={completionContent ?? ''} className="prose prose-sm max-w-none text-foreground" />
        </div>
      )}
      <Link to="/" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>{t('result.backToMap')}</Link>
    </section>
  )
}
