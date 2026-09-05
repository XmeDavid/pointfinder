import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submissionsApi } from '@/lib/api/submissions'
import type { SubmissionStatus } from '@/types'

export function useReviewSubmission(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      submissionId,
      status,
      feedback,
      points,
    }: {
      submissionId: string
      status: SubmissionStatus
      feedback?: string
      points?: number
    }) => submissionsApi.review(submissionId, status, gameId, feedback, points),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', gameId] })
      qc.invalidateQueries({ queryKey: ['monitoring', 'dashboard', gameId] })
    },
  })
}
