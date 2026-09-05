import { StatusBadge } from './StatusBadge'
import type { StatusBadgeTone } from './StatusBadge'
import type { BaseStatus } from '@/types'

export type BaseProgressStatus = BaseStatus

const baseProgressTone: Record<BaseProgressStatus, StatusBadgeTone> = {
  not_visited: 'muted',
  checked_in: 'info',
  submitted: 'warning',
  completed: 'success',
  rejected: 'destructive',
}

const baseProgressLabel: Record<BaseProgressStatus, string> = {
  not_visited: 'Not visited',
  checked_in: 'Checked in',
  submitted: 'Submitted',
  completed: 'Completed',
  rejected: 'Rejected',
}

export interface BaseProgressBadgeProps {
  status: BaseProgressStatus
  className?: string
}

export function BaseProgressBadge({
  status,
  className,
}: BaseProgressBadgeProps) {
  return (
    <StatusBadge
      tone={baseProgressTone[status]}
      label={baseProgressLabel[status]}
      className={className}
      aria-label={`Base progress: ${baseProgressLabel[status]}`}
    />
  )
}
