import type { ActivityEvent } from '@/types'
import type { StatusBadgeTone } from './StatusBadge'

export type ActivityEventStatus = ActivityEvent['type']

export const activityEventLabel: Record<ActivityEventStatus, string> = {
  check_in: 'Check in',
  submission: 'Submission',
  approval: 'Approval',
  rejection: 'Rejection',
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
