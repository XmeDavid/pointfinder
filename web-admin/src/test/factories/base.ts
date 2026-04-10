import type { Base } from '@/types/base'

let counter = 0

export function createMockBase(overrides?: Partial<Base>): Base {
  counter++
  return {
    id: `base-${counter}`,
    gameId: 'game-1',
    name: `Test Base ${counter}`,
    description: '',
    lat: 38.7 + counter * 0.01,
    lng: -9.1 - counter * 0.01,
    nfcLinked: true,
    nfcToken: `NFC-${counter}`,
    hidden: false,
    fixedChallengeId: undefined,
    tagIds: [],
    stageId: null,
    ...overrides,
  }
}

export function resetBaseCounter() {
  counter = 0
}
