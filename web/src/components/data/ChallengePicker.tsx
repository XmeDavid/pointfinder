import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, MapPin, Pin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Challenge, Tag } from '@/types'

export interface ChallengePickerProps {
  /** Selected challenge id, or null for none. */
  value: string | null
  /** Every challenge of the game, in list order. Rows outside `allowedIds` show but cannot be picked. */
  challenges: readonly Challenge[]
  /** Ids the picker may select. The current value is always shown as selected even if absent. */
  allowedIds: ReadonlySet<string>
  /** Why a row cannot be picked, e.g. the base that already holds it. Already translated. */
  reasonFor?: (challengeId: string) => string | null
  /** Game tags, for the chips on each row. */
  tags?: readonly Tag[]
  onChange: (challengeId: string | null) => void
  disabled?: boolean
  /** Names the field: trigger aria-label and the dialog title. */
  label: string
  /** Quieter trigger, e.g. a column the base does not use. */
  dimmed?: boolean
  className?: string
  /** Test id of the trigger; the dialog derives its own from it. */
  testId?: string
}

/**
 * A searchable challenge chooser. The trigger looks like a select and carries
 * `data-value`; the list opens in a dialog (a bottom sheet on phones) with
 * one row per challenge showing points, answer type, location-bound, pinned
 * base and tags, so the right one is findable in a game with dozens. Closing
 * returns focus to the trigger. Test
 * ids: the trigger's `testId`, `challenge-picker-search`,
 * `challenge-option-none`, `challenge-option-{challengeId}`.
 */
export function ChallengePicker({
  value,
  challenges,
  allowedIds,
  reasonFor,
  tags = [],
  onChange,
  disabled = false,
  label,
  dimmed = false,
  className,
  testId,
}: ChallengePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)

  const current = value ? challenges.find((c) => c.id === value) ?? null : null
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return challenges
    return challenges.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true
      return (c.tagIds ?? []).some((id) => tagById.get(id)?.label.toLowerCase().includes(q))
    })
  }, [challenges, query, tagById])

  useEffect(() => {
    if (open) {
      wasOpen.current = true
      const frame = requestAnimationFrame(() => searchRef.current?.focus())
      return () => cancelAnimationFrame(frame)
    }
    // Closing hands focus back to the trigger, as the select it replaces did,
    // so a keyboard operator can move straight on to the next cell.
    if (wasOpen.current) {
      wasOpen.current = false
      triggerRef.current?.focus()
    }
  }, [open])

  const show = () => {
    setQuery('')
    setOpen(true)
  }

  const choose = (id: string | null) => {
    setOpen(false)
    if (id !== value) onChange(id)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={show}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        data-testid={testId}
        data-value={value ?? ''}
        className={cn(
          'flex h-9 w-full min-w-40 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm ring-offset-background transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-muted/50',
          dimmed && 'opacity-60',
          className,
        )}
      >
        <span className={cn('truncate', !current && 'text-muted-foreground')}>{current ? current.title : t('build.assignments.none')}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onClose={() => setOpen(false)}
          className="flex max-h-[85dvh] w-full flex-col self-end overflow-hidden rounded-b-none p-0 max-sm:mb-[calc(-1rem-var(--safe-bottom))] max-sm:pb-[var(--safe-bottom)] sm:max-h-[80dvh] sm:max-w-lg sm:self-center sm:rounded-lg"
          data-testid={testId ? `${testId}-dialog` : undefined}
        >
          <DialogHeader className="mb-0 shrink-0 border-b border-border px-4 pb-3 pt-4 pr-12 text-left">
            <DialogTitle className="text-base">{label}</DialogTitle>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('build.assignments.pickerSearch')}
              aria-label={t('build.assignments.pickerSearch')}
              data-testid="challenge-picker-search"
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </DialogHeader>

          <ul className="min-h-0 flex-1 overflow-y-auto p-2" aria-label={label} data-testid="challenge-picker-list">
            {!query && (
              <Row selected={value === null} onClick={() => choose(null)} testId="challenge-option-none">
                <span className="text-sm text-muted-foreground">{t('build.assignments.pickerNone')}</span>
              </Row>
            )}
            {shown.map((challenge) => {
              const selected = challenge.id === value
              const allowed = selected || allowedIds.has(challenge.id)
              const reason = allowed ? null : reasonFor?.(challenge.id) ?? t('build.assignments.pickerTaken')
              const chips = (challenge.tagIds ?? []).map((id) => tagById.get(id)).filter((tag): tag is Tag => Boolean(tag))
              return (
                <Row
                  key={challenge.id}
                  selected={selected}
                  disabled={!allowed}
                  onClick={() => choose(challenge.id)}
                  testId={`challenge-option-${challenge.id}`}
                >
                  {/* The reason stays at full strength: it is what a blocked row is for. */}
                  <span className={cn('flex min-w-0 flex-col gap-1', !allowed && 'opacity-50')}>
                    <span className="truncate text-sm font-medium text-foreground">{challenge.title}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{t('build.assignments.pickerPoints', { count: challenge.points })}</span>
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                        {t(`build.assignments.pickerAnswer.${challenge.answerType}`)}
                      </Badge>
                      {challenge.locationBound && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {t('build.assignments.pickerLocationBound')}
                        </span>
                      )}
                      {challenge.fixedBaseId && (
                        <span className="inline-flex items-center gap-0.5">
                          <Pin className="h-3 w-3" aria-hidden="true" />
                          {t('build.assignments.pickerPinned')}
                        </span>
                      )}
                      {chips.map((tag) => (
                        <span key={tag.id} className="inline-flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
                          {tag.label}
                        </span>
                      ))}
                    </span>
                  </span>
                  {reason && <span className="shrink-0 text-[11px] font-medium text-foreground">{reason}</span>}
                </Row>
              )
            })}
            {shown.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground" data-testid="challenge-picker-empty">
                {t('build.assignments.pickerNoMatch')}
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Row({
  selected,
  disabled = false,
  onClick,
  testId,
  children,
}: {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  testId: string
  children: React.ReactNode
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        data-testid={testId}
        className={cn(
          'flex w-full items-start justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors',
          selected ? 'bg-primary/10' : 'hover:bg-muted',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        {children}
        {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
      </button>
    </li>
  )
}
