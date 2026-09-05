import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import type { ActivityEvent } from '@/types'
import { ActivityFeed } from './ActivityFeed'

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
