import { useTranslation } from 'react-i18next'
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

const baseProgressLabelKey: Record<BaseProgressStatus, string> = {
  not_visited: 'status.baseProgress.not_visited',
  checked_in: 'status.baseProgress.checked_in',
  submitted: 'status.baseProgress.submitted',
  completed: 'status.baseProgress.completed',
  rejected: 'status.baseProgress.rejected',
}

export interface BaseProgressBadgeProps {
  status: BaseProgressStatus
  className?: string
}

export function BaseProgressBadge({
  status,
  className,
}: BaseProgressBadgeProps) {
  const { t } = useTranslation()
  const label = t(baseProgressLabelKey[status])
  return (
    <StatusBadge
      tone={baseProgressTone[status]}
      label={label}
      className={className}
      aria-label={t('status.baseProgressAria', { label })}
    />
  )
}
