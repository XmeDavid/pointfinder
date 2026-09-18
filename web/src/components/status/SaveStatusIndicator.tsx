import { AlertTriangle, Check, Loader2, PencilLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StatusBadge, type StatusBadgeTone } from './StatusBadge'

/**
 * Where one editor's work stands. `local` is a draft kept on this device and
 * is never presented as a server save; `saved` is a confirmed server write.
 */
export type SaveState = 'idle' | 'local' | 'saving' | 'saved' | 'error' | 'conflict' | 'storage-error'

const tone: Record<SaveState, StatusBadgeTone> = {
  idle: 'muted',
  local: 'warning',
  saving: 'info',
  saved: 'success',
  error: 'destructive',
  conflict: 'warning',
  'storage-error': 'destructive',
}

const labelKey: Record<SaveState, string> = {
  idle: 'status.save.idle',
  local: 'status.save.local',
  saving: 'status.save.saving',
  saved: 'status.save.saved',
  error: 'status.save.error',
  conflict: 'status.save.conflict',
  'storage-error': 'status.save.storageError',
}

export interface SaveStatusIndicatorProps {
  state: SaveState
  /** Failure text from the last save attempt; shown under the badge in the error state. */
  error?: string
  /** Renders nothing when idle (default). Pass false for fixtures. */
  hideIdle?: boolean
  onRetry?: () => void
  onDiscard?: () => void
  onKeepMine?: () => void
  onUseLatest?: () => void
  className?: string
  'data-testid'?: string
}

function StateIcon({ state }: { state: SaveState }) {
  const className = 'h-3.5 w-3.5 shrink-0'
  switch (state) {
    case 'saving':
      return <Loader2 aria-hidden="true" className={cn(className, 'animate-spin motion-reduce:animate-none')} />
    case 'saved':
      return <Check aria-hidden="true" className={className} />
    case 'storage-error':
    case 'error':
    case 'conflict':
      return <AlertTriangle aria-hidden="true" className={className} />
    case 'local':
      return <PencilLine aria-hidden="true" className={className} />
    default:
      return null
  }
}

export function SaveStatusIndicator({
  state,
  error,
  hideIdle = true,
  onRetry,
  onDiscard,
  onKeepMine,
  onUseLatest,
  className,
  'data-testid': testId = 'save-status',
}: SaveStatusIndicatorProps) {
  const { t } = useTranslation()
  if (state === 'idle' && hideIdle) return null
  const label = t(labelKey[state])
  const actions: Array<{ key: string; label: string; onClick: () => void; variant: 'outline' | 'ghost' }> = []
  if ((state === 'error' || state === 'storage-error') && onRetry) actions.push({ key: 'retry', label: t('status.save.retry'), onClick: onRetry, variant: 'outline' })
  if (state === 'conflict' && onKeepMine) actions.push({ key: 'keep', label: t('status.save.keepMine'), onClick: onKeepMine, variant: 'outline' })
  if (state === 'conflict' && onUseLatest) actions.push({ key: 'latest', label: t('status.save.useLatest'), onClick: onUseLatest, variant: 'ghost' })
  if ((state === 'local' || state === 'error' || state === 'storage-error') && onDiscard) actions.push({ key: 'discard', label: t('status.save.discard'), onClick: onDiscard, variant: 'ghost' })
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      data-state={state}
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StatusBadge
          tone={tone[state]}
          label={
            <span className="inline-flex items-center gap-1.5">
              <StateIcon state={state} />
              <span className="truncate">{label}</span>
            </span>
          }
          aria-label={t('status.saveAria', { label })}
        />
        {actions.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant={action.variant}
            size="sm"
            className="h-auto min-h-8 px-2 text-xs"
            onClick={action.onClick}
            data-testid={`${testId}-${action.key}`}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {state === 'error' && error && (
        <p className="text-xs text-destructive" data-testid={`${testId}-message`}>
          {error}
        </p>
      )}
      {state === 'storage-error' && <p className="text-xs text-destructive">{t('status.save.storageErrorHint')}</p>}
      {state === 'conflict' && (
        <p className="text-xs text-muted-foreground" data-testid={`${testId}-message`}>
          {t('status.save.conflictHint')}
        </p>
      )}
    </div>
  )
}
