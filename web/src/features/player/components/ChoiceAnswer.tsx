import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PlayerChoiceOption } from '@pointfinder/api'
import { Alert, Button, cn } from '@/components'

export interface ChoiceAnswerProps {
  options: PlayerChoiceOption[]
  multiple: boolean
  busy: boolean
  /** The challenge asks the team to confirm at the base before the answer goes out. */
  needsPresence?: boolean
  onSubmit: (selectedOptionIds: string[]) => void
}

/**
 * A single or multiple choice question. The phone never knows the answer key:
 * the chosen ids go to the server (or the offline queue), which grades them
 * once. Large rows keep every option easy to hit while walking.
 */
export function ChoiceAnswer({ options, multiple, busy, needsPresence, onSubmit }: ChoiceAnswerProps) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const name = useId()
  const [selected, setSelected] = useState<string[]>([])

  function toggle(id: string, checked: boolean) {
    setSelected((current) => (multiple ? (checked ? [...current, id] : current.filter((x) => x !== id)) : [id]))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    // Keep the organizer's option order, whatever order they were tapped in.
    const ordered = options.map((o) => o.id).filter((id) => selected.includes(id))
    if (ordered.length > 0 && !busy) onSubmit(ordered)
  }

  if (options.length === 0) return <Alert variant="info" data-testid="player-choice-empty">{t('choice.noOptions')}</Alert>

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} data-testid="player-choice-answer">
      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-2 text-sm text-muted-foreground">
          {t(multiple ? 'choice.instructionsMultiple' : 'choice.instructionsSingle')}
        </legend>
        {options.map((option) => {
          const checked = selected.includes(option.id)
          return (
            <label
              key={option.id}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-base transition-colors',
                checked ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted',
                busy && 'cursor-not-allowed opacity-60',
              )}
              data-testid={`player-choice-option-${option.id}`}
            >
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={multiple ? undefined : name}
                value={option.id}
                checked={checked}
                onChange={(e) => toggle(option.id, e.target.checked)}
                className="h-5 w-5 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1 break-words">{option.text}</span>
            </label>
          )
        })}
      </fieldset>
      <p className="text-sm text-muted-foreground" data-testid="player-choice-one-attempt">{t('choice.oneAttempt')}</p>
      {needsPresence && <p className="text-sm text-muted-foreground">{t('solve.presenceInstructions')}</p>}
      <Button size="lg" type="submit" className="text-base" disabled={busy || selected.length === 0} data-testid="player-choice-submit-btn">
        {needsPresence ? t('solve.confirmAtBase') : t('challenge.send')}
      </Button>
      {needsPresence && <p className="text-xs text-muted-foreground">{t('solve.presenceHelp')}</p>}
    </form>
  )
}
