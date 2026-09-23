import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ChoiceOption } from '@/types/v2'
import {
  MAX_CHOICE_OPTIONS,
  MAX_CHOICE_OPTION_TEXT,
  MIN_CHOICE_OPTIONS,
  choiceOptionsProblem,
} from '@/lib/choiceOptions'

export interface ChoiceOptionsEditorProps {
  answerType: 'single_choice' | 'multiple_choice'
  options: ChoiceOption[]
  onChange: (options: ChoiceOption[]) => void
  disabled?: boolean
}

/**
 * The options of a choice question with their answer key. Single choice marks
 * exactly one correct option (radio semantics); multiple choice marks every
 * correct one. Options that already exist keep their id so earlier answers
 * still resolve; new options get theirs from the server.
 */
export function ChoiceOptionsEditor({ answerType, options, onChange, disabled }: ChoiceOptionsEditorProps) {
  const { t } = useTranslation()
  const groupName = useId()
  const headingId = `${groupName}-heading`
  const hintId = `${groupName}-hint`
  const problemId = `${groupName}-problem`
  const single = answerType === 'single_choice'
  const problem = choiceOptionsProblem(answerType, options)
  // Empty rows are part of writing the first options; only point at them once
  // enough options have text to save.
  const written = options.filter((o) => o.text.trim()).length
  const shownProblem = problem === 'emptyText' && written < MIN_CHOICE_OPTIONS ? null : problem

  function setText(index: number, text: string) {
    onChange(options.map((o, i) => (i === index ? { ...o, text } : o)))
  }

  function setCorrect(index: number, correct: boolean) {
    onChange(options.map((o, i) => (single ? { ...o, correct: i === index } : i === index ? { ...o, correct } : o)))
  }

  function remove(index: number) {
    const next = options.filter((_, i) => i !== index)
    // Single choice always keeps one answer marked.
    if (single && options[index]?.correct && next.length > 0) next[0] = { ...next[0], correct: true }
    onChange(next)
  }

  function add() {
    onChange([...options, { text: '', correct: false }])
  }

  return (
    <div className="space-y-2" role="group" aria-labelledby={headingId} aria-describedby={hintId} data-testid="choice-options-editor">
      <p id={headingId} className="block text-xs text-muted-foreground">
        {t('build.choice.options')}
      </p>
      <p id={hintId} className="text-xs text-muted-foreground">
        {t(single ? 'build.choice.hintSingle' : 'build.choice.hintMultiple')}
      </p>
      <ol className="space-y-2">
        {options.map((option, index) => {
          const number = index + 1
          const label = option.text.trim() || t('build.choice.optionLabel', { number })
          return (
            <li key={option.id ?? `new-${index}`} className="flex items-center gap-2" data-testid={`choice-option-${index}`}>
              <label
                className={cn(
                  'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border',
                  option.correct ? 'border-success/40 bg-success/10' : 'border-border bg-background',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <input
                  type={single ? 'radio' : 'checkbox'}
                  name={single ? groupName : undefined}
                  checked={option.correct}
                  disabled={disabled}
                  onChange={(e) => setCorrect(index, e.target.checked)}
                  aria-label={t('build.choice.markCorrect', { option: label })}
                  data-testid={`choice-option-correct-${index}`}
                  className="h-5 w-5 accent-primary"
                />
              </label>
              <Input
                value={option.text}
                onChange={(e) => setText(index, e.target.value)}
                disabled={disabled}
                maxLength={MAX_CHOICE_OPTION_TEXT}
                placeholder={t('build.choice.optionLabel', { number })}
                aria-label={t('build.choice.optionLabel', { number })}
                aria-describedby={shownProblem ? problemId : undefined}
                data-testid={`choice-option-text-${index}`}
                className="min-h-11 min-w-0 flex-1 text-base sm:text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={disabled || options.length <= MIN_CHOICE_OPTIONS}
                onClick={() => remove(index)}
                aria-label={t('build.choice.remove', { option: label })}
                data-testid={`choice-option-remove-${index}`}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={disabled || options.length >= MAX_CHOICE_OPTIONS}
          onClick={add}
          data-testid="choice-option-add"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t('build.choice.add')}
        </Button>
        {options.length >= MAX_CHOICE_OPTIONS && (
          <span className="text-xs text-muted-foreground">{t('build.choice.maxReached', { max: MAX_CHOICE_OPTIONS })}</span>
        )}
      </div>
      {shownProblem && (
        <p id={problemId} className="text-xs text-destructive" role="status" data-testid="choice-options-problem">
          {t(`build.choice.problems.${shownProblem}`, { min: MIN_CHOICE_OPTIONS, max: shownProblem === 'textTooLong' ? MAX_CHOICE_OPTION_TEXT : MAX_CHOICE_OPTIONS })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t('build.choice.gradedNote')}</p>
    </div>
  )
}
