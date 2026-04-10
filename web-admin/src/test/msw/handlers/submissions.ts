import { http, HttpResponse } from 'msw'
import { createMockSubmission } from '../../factories/submission'
import type { SubmissionStatus } from '@/types'

export const submissionsHandlers = [
  http.get('/api/games/:gameId/submissions', ({ request }) => {
    const url = new URL(request.url)
    const teamId = url.searchParams.get('teamId')

    const submissions = [
      createMockSubmission({ id: 'sub-1', teamId: 'team-1', status: 'pending' }),
      createMockSubmission({ id: 'sub-2', teamId: 'team-2', status: 'approved', points: 10 }),
      createMockSubmission({ id: 'sub-3', teamId: 'team-1', status: 'rejected', feedback: 'Incorrect' }),
    ]

    if (teamId) {
      return HttpResponse.json(submissions.filter((s) => s.teamId === teamId))
    }

    return HttpResponse.json(submissions)
  }),

  http.patch('/api/games/:gameId/submissions/:submissionId/review', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { submissionId } = params
    return HttpResponse.json(
      createMockSubmission({
        id: submissionId as string,
        status: (body.status as SubmissionStatus) ?? 'approved',
        feedback: (body.feedback as string) ?? undefined,
        points: (body.points as number) ?? 10,
        reviewedBy: 'operator-1',
      }),
    )
  }),
]
