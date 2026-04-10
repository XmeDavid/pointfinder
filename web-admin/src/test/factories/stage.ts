import type { Stage } from '@/types/stage'

let counter = 0

export function createMockStage(overrides?: Partial<Stage>): Stage {
  counter++
  return {
    id: `stage-${counter}`,
    gameId: 'game-1',
    name: `Stage ${counter}`,
    description: null,
    orderIndex: counter - 1,
    transitionType: 'manual',
    scheduledAt: null,
    triggerBaseId: null,
    isActive: counter === 1,
    baseIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function resetStageCounter() {
  counter = 0
}
