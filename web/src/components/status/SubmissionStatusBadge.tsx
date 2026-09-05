import { StatusBadge } from './StatusBadge'
import type { StatusBadgeTone } from './StatusBadge'
import type { SubmissionStatus } from '@/types'

const submissionStatusTone: Record<SubmissionStatus, StatusBadgeTone> = {
  pending: 'warning',
  approved: 'success',
  correct: 'success',
  rejected: 'destructive',
}

const submissionStatusLabel: Record<SubmissionStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  correct: 'Correct',
  rejected: 'Rejected',
}

export interface SubmissionStatusBadgeProps {
  status: SubmissionStatus
  className?: string
}

export function SubmissionStatusBadge({
  status,
  className,
}: SubmissionStatusBadgeProps) {
  return (
    <StatusBadge
      tone={submissionStatusTone[status]}
      label={submissionStatusLabel[status]}
      className={className}
      aria-label={`Submission status: ${submissionStatusLabel[status]}`}
    />
  )
}
