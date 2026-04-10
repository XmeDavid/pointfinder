import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { CommandOverlay } from './CommandOverlay'

// Mock useGameStream — WebSocket not available in jsdom
vi.mock('@/hooks/subscriptions/useGameStream', () => ({
  useGameStream: vi.fn(() => null),
}))

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

beforeEach(() => {
  useWorkspaceStore.getState().reset()
})

describe('CommandOverlay', () => {
  it('renders ActivityFeed, StatsBar, and Leaderboard', async () => {
    render(createElement(CommandOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('activity-feed')).toBeInTheDocument()
    })
    expect(screen.getByTestId('stats-bar')).toBeInTheDocument()
    expect(screen.getByTestId('leaderboard')).toBeInTheDocument()
  })

  it('does not render TeamInspector when inspectedTeamId is null', async () => {
    render(createElement(CommandOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('activity-feed')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('team-inspector')).not.toBeInTheDocument()
  })

  it('renders TeamInspector when inspectedTeamId is set', async () => {
    useWorkspaceStore.getState().inspectTeam('team-1')

    render(createElement(CommandOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('team-inspector')).toBeInTheDocument()
    })
  })

  it('does not render NotificationSender by default', async () => {
    render(createElement(CommandOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('activity-feed')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('notification-sender')).not.toBeInTheDocument()
  })

  it('renders NotificationSender when toggled on', async () => {
    useWorkspaceStore.getState().toggleNotificationSender()

    render(createElement(CommandOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('notification-sender')).toBeInTheDocument()
    })
  })

  it('shows WS error banner when connection error exists', async () => {
    const { useGameStream } = await import(
      '@/hooks/subscriptions/useGameStream'
    )
    vi.mocked(useGameStream).mockReturnValue('Connection lost')

    render(createElement(CommandOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('ws-error-banner')).toBeInTheDocument()
    })
    expect(screen.getByText(/Connection lost/)).toBeInTheDocument()

    // Reset mock
    vi.mocked(useGameStream).mockReturnValue(null)
  })
})
