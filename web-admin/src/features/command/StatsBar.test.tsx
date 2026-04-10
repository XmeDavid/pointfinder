import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { StatsBar } from './StatsBar'

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

describe('StatsBar', () => {
  it('renders all stat cards', async () => {
    render(createElement(StatsBar, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('stat-teams')).toBeInTheDocument()
    })
    expect(screen.getByTestId('stat-pending')).toBeInTheDocument()
    expect(screen.getByTestId('stat-progress')).toBeInTheDocument()
    expect(screen.getByTestId('stat-elapsed')).toBeInTheDocument()
  })

  it('shows stats from dashboard API', async () => {
    render(createElement(StatsBar, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    // Default MSW handler returns totalTeams: 4, pendingSubmissions: 3
    await waitFor(() => {
      expect(screen.getByTestId('stat-teams')).toHaveTextContent('4')
    })
    expect(screen.getByTestId('stat-pending')).toHaveTextContent('3')
  })

  it('renders the rescue button', async () => {
    render(createElement(StatsBar, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('rescue-btn')).toBeInTheDocument()
    })
  })

  it('toggles notification sender when rescue button is clicked', async () => {
    const user = userEvent.setup()

    render(createElement(StatsBar, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('rescue-btn')).toBeInTheDocument()
    })

    expect(useWorkspaceStore.getState().notificationSenderOpen).toBe(false)
    await user.click(screen.getByTestId('rescue-btn'))
    expect(useWorkspaceStore.getState().notificationSenderOpen).toBe(true)
  })

  it('displays elapsed timer', async () => {
    render(createElement(StatsBar, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      // Timer should display a time string (HH:MM:SS format)
      expect(screen.getByTestId('stat-elapsed').textContent).toMatch(
        /\d{2}:\d{2}:\d{2}/,
      )
    })
  })
})
