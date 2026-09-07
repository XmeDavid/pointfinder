import { Check } from 'lucide-react'
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
 * `quick-filters-clear`.
 */
export function QuickFilters({ groups, className }: QuickFiltersProps) {
  const { t } = useTranslation()
  const visible = groups.filter((group) => group.options.length > 0)
  if (visible.length === 0) return null
  const anyActive = visible.some((group) => group.value.length > 0)

  return (
    <div className={cn('space-y-1.5', className)} data-testid="quick-filters" aria-label={t('build.filters.label')}>
      {visible.map((group) => (
        <div key={group.id} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={group.label}>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-0.5">{group.label}</span>
          {group.mode === 'single' && (
            <Chip
              pressed={group.value.length === 0}
              onClick={() => group.onChange([])}
              testId={`filter-${group.id}-all`}
              label={t('build.filters.all')}
            />
          )}
          {group.options.map((option) => {
            const pressed = group.value.includes(option.id)
            const next = () => {
              if (group.mode === 'single') group.onChange(pressed ? [] : [option.id])
              else group.onChange(pressed ? group.value.filter((id) => id !== option.id) : [...group.value, option.id])
            }
            return (
              <Chip
                key={option.id}
                pressed={pressed}
                onClick={next}
                testId={`filter-${group.id}-${option.id}`}
                label={option.label}
                color={option.color}
              />
            )
          })}
        </div>
      ))}
      {anyActive && (
        <button
          type="button"
          onClick={() => visible.forEach((group) => group.onChange([]))}
          data-testid="quick-filters-clear"
          className="text-xs text-primary hover:underline cursor-pointer"
        >
          {t('build.filters.clear')}
        </button>
      )}
    </div>
  )
}

interface ChipProps {
  pressed: boolean
  onClick: () => void
  testId: string
  label: string
  color?: string
}

function Chip({ pressed, onClick, testId, label, color }: ChipProps) {
  // Coloured chips follow the tag picker: solid tag colour with WCAG-derived
  // text when pressed, tinted outline otherwise. Plain chips use the theme.
  const style = color
    ? {
        backgroundColor: pressed ? color : 'transparent',
        color: pressed ? getReadableTextColor(color) : color,
        borderColor: pressed ? color : `${color}30`,
      }
    : undefined
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid={testId}
      style={style}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer',
        !color && (pressed
          ? 'bg-primary/10 text-primary border-primary/30'
          : 'bg-transparent text-muted-foreground border-border hover:text-foreground'),
      )}
    >
      {pressed && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="truncate">{label}</span>
    </button>
  )
}
