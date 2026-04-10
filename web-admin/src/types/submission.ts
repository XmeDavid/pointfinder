export type SubmissionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'correct'

export interface Submission {
  id: string
  teamId: string
  challengeId: string
  baseId: string
  answer: string
  fileUrl?: string
  fileUrls?: string[]
  status: SubmissionStatus
  submittedAt: string
  reviewedBy?: string
  feedback?: string
  points?: number
  completionContent?: string
}
