import type { Submission } from '@/types'

let counter = 0

export function createMockSubmission(overrides?: Partial<Submission>): Submission {
  counter++
  return {
    id: `sub-${counter}`,
    teamId: 'team-1',
    challengeId: 'challenge-1',
    baseId: 'base-1',
    answer: `Answer ${counter}`,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function resetSubmissionCounter() {
  counter = 0
}
