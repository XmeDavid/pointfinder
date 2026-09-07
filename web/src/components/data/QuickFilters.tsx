import { Check } from 'lucide-react'
import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getReadableTextColor } from '@/lib/colorContrast'
import { cn } from '@/lib/utils'

export interface QuickFilterOption {
  id: string
  label: string
  /** Seven-character hex; a coloured chip (tags). Plain chips otherwise. */
  color?: string
}

export interface QuickFilterGroup {
  id: string
  /** Already-translated group name, read by assistive tech and shown as a prefix. */
  label: string
  /** `single` picks one option or none ("All"); `multi` matches any of the chosen. */
  mode: 'single' | 'multi'
  options: QuickFilterOption[]
  value: string[]
  onChange: (value: string[]) => void
}

export interface QuickFiltersProps {
  groups: QuickFilterGroup[]
  className?: string
}

/**
 * One row of toggle chips per group, above a drawer list. A group with no
 * options renders nothing, so callers pass every group they might have and
 * the row appears only when there is something to filter by. Test ids:
 * `quick-filters`, `filter-{group}-all`, `filter-{group}-{option}`,
 * `quick-filters-clear`. Callers prune their value against the options they
 * pass (see BasesTab), so a chip that disappears never keeps filtering.
 */
export function QuickFilters({ groups, className }: QuickFiltersProps) {
  const { t } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const visible = groups.filter((group) => group.options.length > 0)
  if (visible.length === 0) return null
  const anyActive = visible.some((group) => group.value.length > 0)
  const clearAll = () => {
    visible.forEach((group) => group.onChange([]))
    // The Clear control unmounts itself; keep the keyboard on the row.
    root.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }

  return (
    <div ref={root} role="group" className={cn('space-y-1.5', className)} data-testid="quick-filters" aria-label={t('build.filters.label')}>
      {visible.map((group) => (
        <FilterRow key={group.id} group={group} allLabel={t('build.filters.all')} />
      ))}
      {anyActive && (
        <button
          type="button"
          onClick={clearAll}
          data-testid="quick-filters-clear"
          className="min-h-6 text-xs text-primary hover:underline cursor-pointer"
        >
          {t('build.filters.clear')}
        </button>
      )}
    </div>
  )
}

function FilterRow({ group, allLabel }: { group: QuickFilterGroup; allLabel: string }) {
  const labelId = useId()
  const single = group.mode === 'single'
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role={single ? 'radiogroup' : 'group'}
      aria-labelledby={labelId}
    >
      <span id={labelId} className="text-[11px] uppercase tracking-wider text-muted-foreground mr-0.5">{group.label}</span>
      {single && (
        <Chip
          pressed={group.value.length === 0}
          radio
          onClick={() => group.onChange([])}
          testId={`filter-${group.id}-all`}
          label={allLabel}
        />
      )}
      {group.options.map((option) => {
        const pressed = group.value.includes(option.id)
        const next = () => {
          if (single) group.onChange([option.id])
          else group.onChange(pressed ? group.value.filter((id) => id !== option.id) : [...group.value, option.id])
        }
        return (
          <Chip
            key={option.id}
            pressed={pressed}
            radio={single}
            onClick={next}
            testId={`filter-${group.id}-${option.id}`}
            label={option.label}
            color={option.color}
          />
        )
      })}
    </div>
  )
}

interface ChipProps {
  pressed: boolean
  /** Inside a single-select row: radio semantics instead of a toggle. */
  radio?: boolean
  onClick: () => void
  testId: string
  label: string
  color?: string
}

function Chip({ pressed, radio = false, onClick, testId, label, color }: ChipProps) {
  // A pressed coloured chip is the tag colour with WCAG-derived text; an
  // unpressed one keeps theme text and shows the colour as a dot, because the
  // palette is only guaranteed readable as a background, never as 12px text.
  const style = color && pressed
    ? { backgroundColor: color, color: getReadableTextColor(color), borderColor: color }
    : color
      ? { borderColor: `${color}55` }
      : undefined
  return (
    <button
      type="button"
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? pressed : undefined}
      aria-pressed={radio ? undefined : pressed}
      onClick={onClick}
      data-testid={testId}
      style={style}
      className={cn(
        'inline-flex max-w-full min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer',
        !color && (pressed
          ? 'bg-primary/10 text-primary border-primary/30'
          : 'bg-transparent text-muted-foreground border-border hover:text-foreground'),
        color && !pressed && 'bg-transparent text-foreground hover:bg-muted',
      )}
    >
      {pressed && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {color && !pressed && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />}
      <span className="truncate">{label}</span>
    </button>
  )
}
