import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamMarkers } from './TeamMarkers'
import type { TeamLocation, Team } from '@/types'

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  Marker: ({ children, onClick }: { children: React.ReactNode; onClick?: (e: { originalEvent: { stopPropagation: () => void } }) => void }) => (
    <div data-testid="marker" onClick={() => onClick?.({ originalEvent: { stopPropagation: vi.fn() } })}>
      {children}
    </div>
  ),
  NavigationControl: () => null,
}))

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-1',
    gameId: 'game-1',
    name: 'Alpha Squad',
    joinCode: 'ABCD',
    color: '#3b82f6',
    ...overrides,
  }
}

function makeLocation(overrides: Partial<TeamLocation> = {}): TeamLocation {
  return {
    teamId: 'team-1',
    playerId: 'player-1',
    displayName: 'Player One',
    lat: 38.7,
    lng: -9.1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('TeamMarkers', () => {
  it('renders a marker for each team location', () => {
    const teams = [
      makeTeam({ id: 't1' }),
      makeTeam({ id: 't2', name: 'Bravo' }),
    ]
    const locations = [
      makeLocation({ teamId: 't1', playerId: 'p1' }),
      makeLocation({ teamId: 't2', playerId: 'p2', lat: 38.71, lng: -9.11 }),
    ]

    render(<TeamMarkers locations={locations} teams={teams} />)

    expect(screen.getByTestId('team-marker-t1')).toBeInTheDocument()
    expect(screen.getByTestId('team-marker-t2')).toBeInTheDocument()
  })

  it('does not render marker for unknown team', () => {
    const teams = [makeTeam({ id: 't1' })]
    const locations = [makeLocation({ teamId: 'unknown', playerId: 'p1' })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    expect(screen.queryByTestId('team-marker-unknown')).not.toBeInTheDocument()
  })

  it('uses correct team color via title attribute', () => {
    const teams = [makeTeam({ id: 't1', name: 'Red Team', color: '#ef4444' })]
    const locations = [makeLocation({ teamId: 't1', displayName: 'Scout' })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const marker = screen.getByTestId('team-marker-t1')
    expect(marker.getAttribute('title')).toBe('Red Team - Scout')
  })

  it('marks stale locations', () => {
    const teams = [makeTeam({ id: 't1' })]
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    const locations = [makeLocation({ teamId: 't1', updatedAt: sixMinutesAgo })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const marker = screen.getByTestId('team-marker-t1')
    expect(marker.dataset.stale).toBe('true')
  })

  it('does not mark active locations as stale', () => {
    const teams = [makeTeam({ id: 't1' })]
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    const locations = [makeLocation({ teamId: 't1', updatedAt: oneMinuteAgo })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const marker = screen.getByTestId('team-marker-t1')
    expect(marker.dataset.stale).toBeUndefined()
  })

  it('calls onTeamClick when clicked', () => {
    const handler = vi.fn()
    const teams = [makeTeam({ id: 't1' })]
    const locations = [makeLocation({ teamId: 't1' })]

    render(<TeamMarkers locations={locations} teams={teams} onTeamClick={handler} />)

    fireEvent.click(screen.getByTestId('marker'))
    expect(handler).toHaveBeenCalledWith('t1')
  })

  it('shows team name as tooltip', () => {
    const teams = [makeTeam({ id: 't1', name: 'Charlie Team' })]
    const locations = [makeLocation({ teamId: 't1', displayName: '' })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const marker = screen.getByTestId('team-marker-t1')
    expect(marker.getAttribute('title')).toBe('Charlie Team')
  })
})
