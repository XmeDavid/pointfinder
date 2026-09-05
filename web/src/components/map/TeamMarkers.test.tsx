import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeamMarkers, TEAM_LOCATIONS_SOURCE_ID } from './TeamMarkers'
import type { TeamLocation, Team } from '@/types'

// Capture the latest Source props for assertion
let lastSourceProps: Record<string, unknown> = {}

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  Source: (props: Record<string, unknown>) => {
    lastSourceProps = props
    return <div data-testid="source">{props.children as React.ReactNode}</div>
  },
  Layer: (props: Record<string, unknown>) => (
    <div data-testid={`layer-${props.id}`} />
  ),
  useMap: () => ({ current: undefined }),
  Marker: () => null,
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

function getFeatures(): GeoJSON.Feature[] {
  const data = lastSourceProps.data as GeoJSON.FeatureCollection | undefined
  return data?.features ?? []
}

beforeEach(() => {
  lastSourceProps = {}
})

describe('TeamMarkers', () => {
  it('renders a Source with correct clustering config', () => {
    const teams = [makeTeam({ id: 't1' })]
    const locations = [makeLocation({ teamId: 't1' })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    expect(screen.getByTestId('source')).toBeInTheDocument()
    expect(lastSourceProps.id).toBe(TEAM_LOCATIONS_SOURCE_ID)
    expect(lastSourceProps.type).toBe('geojson')
    expect(lastSourceProps.cluster).toBe(true)
    expect(lastSourceProps.clusterRadius).toBe(50)
    expect(lastSourceProps.clusterMaxZoom).toBe(14)
  })

  it('renders three layers (cluster circle, cluster count, individual point)', () => {
    const teams = [makeTeam({ id: 't1' })]
    const locations = [makeLocation({ teamId: 't1' })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    expect(screen.getByTestId('layer-team-cluster-circle')).toBeInTheDocument()
    expect(screen.getByTestId('layer-team-cluster-count')).toBeInTheDocument()
    expect(screen.getByTestId('layer-team-individual-point')).toBeInTheDocument()
  })

  it('creates a GeoJSON feature for each team location', () => {
    const teams = [
      makeTeam({ id: 't1' }),
      makeTeam({ id: 't2', name: 'Bravo' }),
    ]
    const locations = [
      makeLocation({ teamId: 't1', playerId: 'p1' }),
      makeLocation({ teamId: 't2', playerId: 'p2', lat: 38.71, lng: -9.11 }),
    ]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const features = getFeatures()
    expect(features).toHaveLength(2)
    expect(features[0].properties?.teamId).toBe('t1')
    expect(features[1].properties?.teamId).toBe('t2')
  })

  it('does not create a feature for unknown team', () => {
    const teams = [makeTeam({ id: 't1' })]
    const locations = [makeLocation({ teamId: 'unknown', playerId: 'p1' })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    expect(getFeatures()).toHaveLength(0)
  })

  it('uses correct team color in feature properties', () => {
    const teams = [makeTeam({ id: 't1', color: '#ef4444' })]
    const locations = [makeLocation({ teamId: 't1' })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const features = getFeatures()
    expect(features[0].properties?.color).toBe('#ef4444')
  })

  it('marks stale locations in feature properties', () => {
    const teams = [makeTeam({ id: 't1' })]
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    const locations = [makeLocation({ teamId: 't1', updatedAt: sixMinutesAgo })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const features = getFeatures()
    expect(features[0].properties?.stale).toBe(true)
  })

  it('does not mark active locations as stale', () => {
    const teams = [makeTeam({ id: 't1' })]
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    const locations = [makeLocation({ teamId: 't1', updatedAt: oneMinuteAgo })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const features = getFeatures()
    expect(features[0].properties?.stale).toBe(false)
  })

  it('includes team name in feature properties', () => {
    const teams = [makeTeam({ id: 't1', name: 'Charlie Team' })]
    const locations = [makeLocation({ teamId: 't1', displayName: 'Scout' })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const features = getFeatures()
    expect(features[0].properties?.teamName).toBe('Charlie Team')
    expect(features[0].properties?.displayName).toBe('Scout')
  })

  it('sets correct coordinates in feature geometry', () => {
    const teams = [makeTeam({ id: 't1' })]
    const locations = [makeLocation({ teamId: 't1', lat: 38.7, lng: -9.1 })]

    render(<TeamMarkers locations={locations} teams={teams} />)

    const features = getFeatures()
    const coords = (features[0].geometry as GeoJSON.Point).coordinates
    expect(coords).toEqual([-9.1, 38.7])
  })
})
