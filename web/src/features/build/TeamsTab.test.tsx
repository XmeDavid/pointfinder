import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockTeam, resetTeamCounter } from '@/test/factories/team'
import { useWorkspaceStore } from '@/stores/workspace'
import { TeamsTab } from './TeamsTab'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const gameId = 'game-1'

describe('TeamsTab', () => {
  beforeEach(() => {
    resetTeamCounter()
    useWorkspaceStore.getState().reset()
  })

  it('renders team list from API', async () => {
    render(<TeamsTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument()
      expect(screen.getByText('Team Beta')).toBeInTheDocument()
    })
  })

  it('shows empty state when no teams', async () => {
    server.use(
      http.get('/api/games/:gameId/teams', () => {
        return HttpResponse.json([])
      }),
    )

    render(<TeamsTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('No teams yet')).toBeInTheDocument()
    })
  })

  it('shows color dot for each team', async () => {
    server.use(
      http.get('/api/games/:gameId/teams', () => {
        return HttpResponse.json([
          createMockTeam({ id: 'team-1', name: 'Red Team', color: '#ef4444' }),
        ])
      }),
    )

    render(<TeamsTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Red Team')).toBeInTheDocument()
    })

    // The color dot is a span with backgroundColor
    const button = screen.getByTestId('team-item-team-1')
    const dot = button.querySelector('span[style]')
    expect(dot).toHaveStyle({ backgroundColor: '#ef4444' })
  })

  it('shows join code for each team', async () => {
    server.use(
      http.get('/api/games/:gameId/teams', () => {
        return HttpResponse.json([
          createMockTeam({ id: 'team-1', name: 'Team A', joinCode: 'ABC123' }),
        ])
      }),
    )

    render(<TeamsTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('ABC123')).toBeInTheDocument()
    })
  })

  it('selects a team on click', async () => {
    const user = userEvent.setup()

    render(<TeamsTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('team-item-team-1'))

    expect(useWorkspaceStore.getState().selectedTeamId).toBe('team-1')
  })

  it('shows detail panel when team is selected', async () => {
    useWorkspaceStore.getState().selectTeam('team-1')

    render(<TeamsTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('team-detail')).toBeInTheDocument()
    })
  })

  it('shows empty detail state when no team selected', async () => {
    render(<TeamsTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByText('Select a team to view details'),
      ).toBeInTheDocument()
    })
  })
})
