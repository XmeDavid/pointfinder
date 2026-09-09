import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CLUB_LIMIT_FIELDS, type LimitField, type LimitState } from './clubLimits'

interface Props {
  value: LimitState
  onChange: (next: LimitState) => void
  /** Keys whose number the form cannot use, marked so the row explains itself. */
  invalidKeys?: string[]
  disabled?: boolean
}

/**
 * The agreed limits of a club deal, one row per quota override key. Each row
 * chooses between a number, unlimited, and the tier default; the byte limits
 * are entered in gigabytes because that is how a deal is written down.
 */
export function ClubLimitsFields({ value, onChange, invalidKeys = [], disabled = false }: Props) {
  const { t } = useTranslation()

  const set = (key: string, next: Partial<LimitState[string]>) => {
    onChange({ ...value, [key]: { ...value[key], ...next } })
  }

  return (
    <div className="space-y-3" data-testid="club-limits">
      {CLUB_LIMIT_FIELDS.map((field) => (
        <LimitRow
          key={field.key}
          field={field}
          entry={value[field.key] ?? { mode: 'default', input: '' }}
          invalid={invalidKeys.includes(field.key)}
          disabled={disabled}
          onModeChange={(mode) => set(field.key, { mode })}
          onInputChange={(input) => set(field.key, { input })}
          onToggleChange={(next) => set(field.key, next)}
          unitLabel={field.kind === 'bytes' ? t('admin.limits.gigabytes') : undefined}
          label={t(field.labelKey)}
        />
      ))}
      <p className="text-xs text-muted-foreground">{t('admin.limits.hint')}</p>
    </div>
  )
}

interface RowProps {
  field: LimitField
  entry: LimitState[string]
  invalid: boolean
  disabled: boolean
  label: string
  unitLabel?: string
  onModeChange: (mode: LimitState[string]['mode']) => void
  onInputChange: (input: string) => void
  onToggleChange: (next: LimitState[string]) => void
}

function LimitRow({
  field,
  entry,
  invalid,
  disabled,
  label,
  unitLabel,
  onModeChange,
  onInputChange,
  onToggleChange,
}: RowProps) {
  const { t } = useTranslation()
  const modeId = `club-limit-${field.key}-mode`
  const valueId = `club-limit-${field.key}-value`

  if (field.kind === 'toggle') {
    // One control: the flag has no separate "unlimited".
    const current = entry.mode === 'default' ? 'default' : entry.input === 'true' ? 'on' : 'off'
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <label htmlFor={modeId} className="text-sm text-foreground">
          {label}
        </label>
        <Select
          id={modeId}
          data-testid={modeId}
          disabled={disabled}
          value={current}
          onChange={(e) =>
            onToggleChange(
              e.target.value === 'default'
                ? { mode: 'default', input: '' }
                : { mode: 'value', input: e.target.value === 'on' ? 'true' : 'false' },
            )
          }
          className="w-44"
        >
          <option value="on">{t('admin.limits.on')}</option>
          <option value="off">{t('admin.limits.off')}</option>
          <option value="default">{t('admin.limits.tierDefault')}</option>
        </Select>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-3">
      <label htmlFor={entry.mode === 'value' ? valueId : modeId} className="text-sm text-foreground pt-2">
        {label}
        {unitLabel && entry.mode === 'value' && (
          <span className="text-muted-foreground"> ({unitLabel})</span>
        )}
      </label>
      <div className="flex items-start gap-2">
        {entry.mode === 'value' && (
          <div>
            <Input
              id={valueId}
              data-testid={valueId}
              type="number"
              min="1"
              inputMode="decimal"
              disabled={disabled}
              aria-invalid={invalid || undefined}
              value={entry.input}
              onChange={(e) => onInputChange(e.target.value)}
              className={`w-28 ${invalid ? 'border-destructive' : ''}`}
            />
            {invalid && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {t('admin.limits.invalid')}
              </p>
            )}
          </div>
        )}
        <Select
          id={modeId}
          data-testid={modeId}
          disabled={disabled}
          aria-label={t('admin.limits.modeFor', { limit: label })}
          value={entry.mode}
          onChange={(e) => onModeChange(e.target.value as LimitState[string]['mode'])}
          className="w-44"
        >
          <option value="value">{t('admin.limits.upTo')}</option>
          <option value="unlimited">{t('admin.limits.unlimited')}</option>
          <option value="default">{t('admin.limits.tierDefault')}</option>
        </Select>
      </div>
    </div>
  )
}
