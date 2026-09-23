import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ChoiceOption } from '@/types'

/**
 * A choice answer next to the answer key: every option in the organizer's
 * order, marked when the team chose it and when it is correct. The server
 * already graded it; this is for the operator to read, not to decide.
 */
export function ChoiceReview({ options, selectedOptionIds, answer }: {
  options: ChoiceOption[]
  selectedOptionIds: string[]
  /** The chosen texts as the team saw them, kept for options edited or removed since. */
  answer?: string
}) {
  const { t } = useTranslation()
  const chosen = new Set(selectedOptionIds)
  const known = new Set(options.map((o) => o.id))
  const orphaned = selectedOptionIds.some((id) => !known.has(id))
  return (
    <div data-testid="choice-review">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">{t('submissions.choiceAnswer')}</span>
      <ul className="space-y-1">
        {options.map((option, index) => {
          const picked = option.id != null && chosen.has(option.id)
          return (
            <li
              key={option.id ?? index}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                picked ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-muted/30 text-muted-foreground',
              )}
              data-testid={`choice-review-option-${index}`}
            >
              <span className="min-w-0 flex-1 break-words">{option.text}</span>
              {picked && <span className="shrink-0 text-xs font-medium text-foreground">{t('submissions.chosen')}</span>}
              {option.correct && (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-success">
                  <Check className="h-3 w-3" aria-hidden />
                  {t('submissions.correctOption')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {orphaned && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="choice-review-orphaned">
          {t('submissions.optionRemoved')}{answer ? ` (${answer})` : ''}
        </p>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">{t('submissions.choiceGraded')}</p>
    </div>
  )
}
