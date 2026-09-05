import type { GameTag } from '@/types/tag'

let counter = 0

export function createMockTag(overrides?: Partial<GameTag>): GameTag {
  counter++
  return {
    id: `tag-${counter}`,
    gameId: 'game-1',
    label: `Tag ${counter}`,
    color: '#3b82f6',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function resetTagCounter() {
  counter = 0
}
