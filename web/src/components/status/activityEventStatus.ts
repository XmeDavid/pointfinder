import type { ActivityEvent } from '@/types'
import type { StatusBadgeTone } from './StatusBadge'

export type ActivityEventStatus = ActivityEvent['type']

/** Translation keys; render with `t(activityEventLabelKey[status])`. */
export const activityEventLabelKey: Record<ActivityEventStatus, string> = {
  check_in: 'status.activity.check_in',
  submission: 'status.activity.submission',
  approval: 'status.activity.approval',
  rejection: 'status.activity.rejection',
}

export const activityEventTone: Record<ActivityEventStatus, StatusBadgeTone> = {
  check_in: 'info',
  submission: 'warning',
  approval: 'success',
  rejection: 'destructive',
}

export const activityEventBorderClass: Record<ActivityEventStatus, string> = {
  check_in: 'border-l-info',
  submission: 'border-l-warning',
  approval: 'border-l-success',
  rejection: 'border-l-destructive',
}
