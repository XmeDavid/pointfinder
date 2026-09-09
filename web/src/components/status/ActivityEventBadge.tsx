import { useTranslation } from 'react-i18next'
import { StatusBadge } from './StatusBadge'
import {
  activityEventLabelKey,
  activityEventTone,
  type ActivityEventStatus,
} from './activityEventStatus'

export interface ActivityEventBadgeProps {
  status: ActivityEventStatus
  className?: string
}

export function ActivityEventBadge({
  status,
  className,
}: ActivityEventBadgeProps) {
  const { t } = useTranslation()
  const label = t(activityEventLabelKey[status])
  return (
    <StatusBadge
      tone={activityEventTone[status]}
      label={label}
      size="sm"
      className={className}
      aria-label={t('status.activityAria', { label })}
    />
  )
}
