import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderPlayer } from '@/features/player/test/renderPlayer'
import { useLocationStore } from '@/app/player/locationStore'
import * as geolocation from '@/platform/geolocation'

let lastSourceProps: Record<string, unknown> = {}

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  Source: (props: Record<string, unknown>) => { lastSourceProps = props; return <div data-testid="source">{props.children as React.ReactNode}</div> },
  Layer: (props: Record<string, unknown>) => <div data-testid={`layer-${props.id}`} />,
  Marker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useMap: () => ({ current: undefined }),
  NavigationControl: () => null,
}))

function gameWithMethods(methods: Array<'NFC' | 'QR' | 'LOCATION'>) {
  const bases = methods.map((method, i) => ({ id: `b${i + 1}`, gameId: 'g1', lat: 40.09 + i / 1000, lng: -8.87, nfcLinked: method === 'NFC', hidden: false, fixedChallengeId: null, checkInMethod: method, checkInRadiusM: 20 }))
  const progress = methods.map((method, i) => ({ baseId: `b${i + 1}`, challengeTitle: `Base ${i + 1}`, lat: 40.09 + i / 1000, lng: -8.87, nfcLinked: method === 'NFC', status: 'not_visited', checkedInAt: null, challengeId: null, submissionStatus: null, checkInMethod: method, checkInRadiusM: 20 }))
  server.use(
    http.get('/api/player/games/:gameId/data', () => HttpResponse.json({ gameStatus: 'live', unlockTrigger: 'CHECK_IN', bases, challenges: [], assignments: [], progress })),
    http.get('/api/games/:gameId/snapshot', () => HttpResponse.json({ stateVersion: 1, game: { id: 'g1', name: 'Serra da Estrela', status: 'live', tileSource: 'osm' }, team: { id: 'team1', name: 'Falcons', memberCount: 4 }, progress, submissions: [], uploadSessions: [] })),
  )
}

async function renderMap() {
  const platform = await import('@/platform')
  vi.spyOn(platform, 'isNative').mockReturnValue(true)
  const { default: PlayerMap } = await import('./PlayerMap')
  return renderPlayer(<PlayerMap />, { route: '/' })
}

beforeEach(() => {
  // The runtime owns the watch; jsdom has no geolocation, so keep it inert.
  vi.spyOn(geolocation, 'watchLocation').mockResolvedValue(() => {})
  useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {} })
})

describe('PlayerMap check-in methods', () => {
  it('draws a radius ring for visible location bases only', async () => {
    lastSourceProps = {}
    gameWithMethods(['LOCATION', 'NFC'])
    await renderMap()
    await waitFor(() => expect((lastSourceProps.data as GeoJSON.FeatureCollection | undefined)?.features).toHaveLength(1))
    expect((lastSourceProps.data as GeoJSON.FeatureCollection).features[0]!.id).toBe('b1')
  })

  it('offers a QR scan action when the game has QR bases', async () => {
    gameWithMethods(['QR'])
    await renderMap()
    expect(await screen.findByTestId('player-map-scan-qr-btn')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tap a base tag' })).not.toBeInTheDocument()
  })

  it('offers only the NFC action when no QR base exists', async () => {
    gameWithMethods(['NFC'])
    await renderMap()
    expect(await screen.findByRole('button', { name: 'Tap a base tag' })).toBeInTheDocument()
    expect(screen.queryByTestId('player-map-scan-qr-btn')).not.toBeInTheDocument()
  })

  it('warns that location bases will not unlock while permission is denied', async () => {
    gameWithMethods(['LOCATION'])
    useLocationStore.setState({ status: 'denied' })
    await renderMap()
    expect(await screen.findByTestId('player-map-location-warning'))
      .toHaveTextContent('Location is off. Bases that unlock by position will not open.')
  })
})
