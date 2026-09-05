import type { Game } from '@/types'

const defaults: Game = {
  id: 'game-default',
  name: 'Default Game',
  description: 'A test game',
  startDate: '2026-06-01T09:00:00Z',
  endDate: '2026-06-01T17:00:00Z',
  status: 'setup',
  createdBy: 'user-1',
  operatorIds: ['user-1'],
  uniformAssignment: false,
  broadcastEnabled: false,
  broadcastCode: null,
  tileSource: 'openstreetmap',
  unlockTrigger: 'CHECK_IN',
}

export function createMockGame(overrides?: Partial<Game>): Game {
  return { ...defaults, ...overrides }
}
