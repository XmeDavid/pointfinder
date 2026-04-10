import type { Team } from '@/types/team'

let counter = 0
const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f6', '#f97316']

export function createMockTeam(overrides?: Partial<Team>): Team {
  counter++
  return {
    id: `team-${counter}`,
    gameId: 'game-1',
    name: `Team ${counter}`,
    color: colors[(counter - 1) % colors.length],
    joinCode: `T${counter.toString().padStart(4, '0')}`,
    ...overrides,
  }
}

export function resetTeamCounter() {
  counter = 0
}
