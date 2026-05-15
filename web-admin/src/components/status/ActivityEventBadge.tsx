import { StatusBadge } from './StatusBadge'
import {
  activityEventLabel,
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
  return (
    <StatusBadge
      tone={activityEventTone[status]}
      label={activityEventLabel[status]}
      size="sm"
      className={className}
      aria-label={`Activity event: ${activityEventLabel[status]}`}
    />
  )
}
