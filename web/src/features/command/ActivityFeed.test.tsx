import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import type { ActivityEvent } from '@/types'
import { ActivityFeed } from './ActivityFeed'
import { createMockBase } from '@/test/factories/base'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const mockEvents: ActivityEvent[] = [
  {
    id: 'event-1',
    gameId: 'game-1',
    type: 'check_in',
    teamId: 'team-1',
    baseId: 'base-1',
    message: 'Team Alpha checked in at Base 1',
    timestamp: new Date().toISOString(),
  },
  {
    id: 'event-2',
    gameId: 'game-1',
    type: 'submission',
    teamId: 'team-2',
    baseId: 'base-2',
    challengeId: 'challenge-1',
    message: 'Team Beta submitted an answer',
    timestamp: new Date().toISOString(),
  },
  {
    id: 'event-3',
    gameId: 'game-1',
    type: 'approval',
    teamId: 'team-1',
    baseId: 'base-1',
    challengeId: 'challenge-1',
    message: 'Team Alpha answer approved',
    timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(), // 2 hours ago
  },
]

beforeEach(() => {
  server.use(
    http.get('/api/games/:gameId/monitoring/activity', () =>
      HttpResponse.json(mockEvents),
    ),
  )
})

describe('ActivityFeed', () => {
  it('renders the Live Activity header', async () => {
    render(createElement(ActivityFeed, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Live Activity')).toBeInTheDocument()
    })
  })

  it('renders activity events from the API', async () => {
    render(createElement(ActivityFeed, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Team Alpha checked in at Base 1')).toBeInTheDocument()
    })
    expect(screen.getByText('Team Beta submitted an answer')).toBeInTheDocument()
    expect(screen.getByText('Team Alpha answer approved')).toBeInTheDocument()
  })

  it('shows empty message when no events', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/activity', () =>
        HttpResponse.json([]),
      ),
    )

    render(createElement(ActivityFeed, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('empty-activity')).toBeInTheDocument()
    })
    expect(screen.getByText('No activity yet. Events will appear here once teams start playing.')).toBeInTheDocument()
  })

  it('filters by event type when type pill is clicked', async () => {
    const user = userEvent.setup()

    render(createElement(ActivityFeed, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Team Alpha checked in at Base 1')).toBeInTheDocument()
    })

    // Click the "check in" type filter
    await user.click(screen.getByTestId('filter-check_in'))

    // Only check_in events visible
    expect(screen.getByText('Team Alpha checked in at Base 1')).toBeInTheDocument()
    expect(screen.queryByText('Team Beta submitted an answer')).not.toBeInTheDocument()
    expect(screen.queryByText('Team Alpha answer approved')).not.toBeInTheDocument()
  })

  it('resets type filter when "All" pill is clicked', async () => {
    const user = userEvent.setup()

    render(createElement(ActivityFeed, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Team Alpha checked in at Base 1')).toBeInTheDocument()
    })

    // Filter to check_in only
    await user.click(screen.getByTestId('filter-check_in'))
    expect(screen.queryByText('Team Beta submitted an answer')).not.toBeInTheDocument()

    // Reset
    await user.click(screen.getByTestId('filter-all'))

    expect(screen.getByText('Team Alpha checked in at Base 1')).toBeInTheDocument()
    expect(screen.getByText('Team Beta submitted an answer')).toBeInTheDocument()
  })

  it('filters by time window', async () => {
    const user = userEvent.setup()

    render(createElement(ActivityFeed, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getAllByTestId('activity-event').length).toBe(3)
    })

    // Click 30m filter — event-3 (2h ago) should be hidden
    await user.click(screen.getByTestId('time-filter-30m'))

    await waitFor(() => {
      expect(screen.getAllByTestId('activity-event').length).toBe(2)
    })
    expect(screen.queryByText('Team Alpha answer approved')).not.toBeInTheDocument()
  })

  it('has a CSV export button', async () => {
    render(createElement(ActivityFeed, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('export-csv')).toBeInTheDocument()
    })
  })
})

describe('ActivityFeed check-in methods', () => {
  it('marks each check-in with its method icon', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/activity', () =>
        HttpResponse.json([
          {
            id: 'event-qr',
            gameId: 'game-1',
            type: 'check_in',
            teamId: 'team-1',
            baseId: 'base-1',
            message: 'Team Alpha checked in at Base 1',
            timestamp: new Date().toISOString(),
            metadata: { method: 'QR', verification: 'VERIFIED' },
          },
        ] satisfies ActivityEvent[]),
      ),
    )

    render(createElement(ActivityFeed, { gameId: 'game-1' }), { wrapper: createWrapper() })

    const icon = await screen.findByTestId('activity-method-event-qr')
    expect(icon).toHaveAttribute('aria-label', 'QR code')
    expect(screen.queryByTestId('activity-claimed-badge')).not.toBeInTheDocument()
  })

  it('flags a claimed check-in with the teammate summary for the wide ring', async () => {
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({
            id: 'base-1',
            checkInMethod: 'LOCATION',
            checkInRadiusM: 20,
            lat: 38.7,
            lng: -9.1,
          }),
        ]),
      ),
      http.get('/api/games/:gameId/monitoring/activity', () =>
        HttpResponse.json([
          {
            id: 'event-claim',
            gameId: 'game-1',
            type: 'check_in',
            teamId: 'team-1',
            baseId: 'base-1',
            message: 'Team Alpha claimed Base 1',
            timestamp: new Date().toISOString(),
            metadata: {
              method: 'LOCATION',
              verification: 'CLAIMED',
              teammatesInRing: 2,
              teammatesTotal: 4,
            },
          },
        ] satisfies ActivityEvent[]),
      ),
    )

    render(createElement(ActivityFeed, { gameId: 'game-1' }), { wrapper: createWrapper() })

    expect(await screen.findByTestId('activity-claimed-badge')).toHaveTextContent('Claimed')
    // wideRingM(20) === max(60, 50) === 60
    await waitFor(() => {
      expect(screen.getByTestId('activity-teammates-event-claim')).toHaveTextContent(
        '2 of 4 teammates within 60 m',
      )
    })
  })

  it('renders a pre-feature check-in without a method icon', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/activity', () =>
        HttpResponse.json([
          {
            id: 'event-legacy',
            gameId: 'game-1',
            type: 'check_in',
            teamId: 'team-1',
            baseId: 'base-1',
            message: 'Team Alpha checked in at Base 1',
            timestamp: new Date().toISOString(),
          },
        ] satisfies ActivityEvent[]),
      ),
    )

    render(createElement(ActivityFeed, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await screen.findByText('Team Alpha checked in at Base 1')
    expect(screen.queryByTestId('activity-method-event-legacy')).not.toBeInTheDocument()
  })
})
