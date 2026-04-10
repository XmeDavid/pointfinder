import type { Challenge } from '@/types'

let counter = 0

export function createMockChallenge(overrides?: Partial<Challenge>): Challenge {
  counter++
  return {
    id: `challenge-${counter}`,
    gameId: 'game-1',
    title: `Challenge ${counter}`,
    description: `Description for challenge ${counter}`,
    content: `Content for challenge ${counter}`,
    completionContent: `Well done completing challenge ${counter}!`,
    answerType: 'text',
    autoValidate: false,
    points: 10,
    locationBound: false,
    requirePresenceToSubmit: false,
    ...overrides,
  }
}

export function resetChallengeCounter() {
  counter = 0
}
