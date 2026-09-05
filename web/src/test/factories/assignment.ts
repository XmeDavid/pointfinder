import type { Assignment } from '@/types'

let counter = 0

export function createMockAssignment(overrides?: Partial<Assignment>): Assignment {
  counter++
  return {
    id: `assignment-${counter}`,
    gameId: 'game-1',
    baseId: `base-${counter}`,
    challengeId: `challenge-${counter}`,
    ...overrides,
  }
}

export function resetAssignmentCounter() {
  counter = 0
}
