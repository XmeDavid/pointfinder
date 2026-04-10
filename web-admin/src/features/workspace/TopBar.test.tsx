import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'
import type { Game, Stage } from '@/types/v2'

// Mock the workspace store
const mockStore = {
  selectedStageId: null as string | null,
  selectStage: vi.fn(),
  mode: 'build' as const,
  setMode: vi.fn(),
}

vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}))

// Mock useElapsedTimer
vi.mock('@/hooks/ui/useElapsedTimer', () => ({
  useElapsedTimer: (startIso: string | null) => (startIso ? '01:23:45' : '00:00:00'),
}))

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    name: 'Test Game',
    description: 'A test game',
    startDate: null,
    endDate: null,
    status: 'setup',
    createdBy: 'operator-1',
    operatorIds: ['operator-1'],
    uniformAssignment: false,
    broadcastEnabled: false,
    broadcastCode: null,
    tileSource: 'osm',
    unlockTrigger: 'CHECK_IN',
    ...overrides,
  }
}

function makeStage(overrides: Partial<Stage> & { id: string; name: string }): Stage {
  return {
    gameId: 'game-1',
    description: null,
    orderIndex: 0,
    transitionType: 'manual',
    scheduledAt: null,
    triggerBaseId: null,
    isActive: false,
    baseIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('TopBar', () => {
  beforeEach(() => {
    mockStore.selectedStageId = null
    mockStore.mode = 'build'
    mockStore.selectStage.mockClear()
    mockStore.setMode.mockClear()
  })

  it('renders game name', () => {
    render(<TopBar game={makeGame({ name: 'My Cool Game' })} stages={[]} />)
    expect(screen.getByText('My Cool Game')).toBeDefined()
  })

  it('shows SETUP badge for setup games', () => {
    render(<TopBar game={makeGame({ status: 'setup' })} stages={[]} />)
    expect(screen.getByText('SETUP')).toBeDefined()
  })

  it('shows ENDED badge for ended games', () => {
    render(<TopBar game={makeGame({ status: 'ended' })} stages={[]} />)
    expect(screen.getByText('ENDED')).toBeDefined()
  })

  it('shows elapsed timer when game is live', () => {
    render(
      <TopBar
        game={makeGame({ status: 'live', startDate: '2026-04-10T10:00:00Z' })}
        stages={[]}
      />,
    )
    // The mocked timer returns '01:23:45'
    expect(screen.getByText(/LIVE/)).toBeDefined()
    expect(screen.getByText(/01:23:45/)).toBeDefined()
  })

  it('does not show stage strip for games with fewer than 2 stages', () => {
    const single = [makeStage({ id: 's1', name: 'Only Stage', orderIndex: 0 })]
    render(<TopBar game={makeGame()} stages={single} />)
    // The "All" button only appears if StageStrip renders (2+ stages)
    expect(screen.queryByText('All')).toBeNull()
  })

  it('shows stage strip when 2+ stages', () => {
    const stages = [
      makeStage({ id: 's1', name: 'Stage A', orderIndex: 0 }),
      makeStage({ id: 's2', name: 'Stage B', orderIndex: 1 }),
    ]
    render(<TopBar game={makeGame()} stages={stages} />)
    expect(screen.getByText('All')).toBeDefined()
    expect(screen.getByText('Stage A')).toBeDefined()
    expect(screen.getByText('Stage B')).toBeDefined()
  })

  it('shows divider only when stages are present', () => {
    const { container: noStages } = render(<TopBar game={makeGame()} stages={[]} />)
    // No divider (w-px h-5 bg-border)
    expect(noStages.querySelector('.bg-border.h-5')).toBeNull()

    const stages = [
      makeStage({ id: 's1', name: 'A', orderIndex: 0 }),
      makeStage({ id: 's2', name: 'B', orderIndex: 1 }),
    ]
    const { container: withStages } = render(<TopBar game={makeGame()} stages={stages} />)
    expect(withStages.querySelector('.bg-border.h-5')).not.toBeNull()
  })
})
