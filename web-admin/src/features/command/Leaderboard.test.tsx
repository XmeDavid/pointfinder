import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { Leaderboard } from './Leaderboard'

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

describe('Leaderboard', () => {
  it('renders the leaderboard toggle header', async () => {
    render(createElement(Leaderboard, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-toggle')).toBeInTheDocument()
    })
    expect(screen.getByText('Leaderboard')).toBeInTheDocument()
  })

  it('does not show the list when collapsed', async () => {
    render(createElement(Leaderboard, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-toggle')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('leaderboard-list')).not.toBeInTheDocument()
  })

  it('expands and shows team entries when toggled', async () => {
    const user = userEvent.setup()

    render(createElement(Leaderboard, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-toggle')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('leaderboard-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-list')).toBeInTheDocument()
    })

    // Default MSW handler returns Team Alpha (50 pts) and Team Beta (35 pts)
    const entries = screen.getAllByTestId('leaderboard-entry')
    expect(entries.length).toBe(2)
    expect(screen.getByText('Team Alpha')).toBeInTheDocument()
    expect(screen.getByText('Team Beta')).toBeInTheDocument()
  })

  it('sorts teams by points descending', async () => {
    const user = userEvent.setup()

    render(createElement(Leaderboard, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-toggle')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('leaderboard-toggle'))

    await waitFor(() => {
      const entries = screen.getAllByTestId('leaderboard-entry')
      expect(entries.length).toBe(2)
      // First entry should be Team Alpha (50 pts), second Team Beta (35 pts)
      expect(entries[0]).toHaveTextContent('Team Alpha')
      expect(entries[0]).toHaveTextContent('50')
      expect(entries[1]).toHaveTextContent('Team Beta')
      expect(entries[1]).toHaveTextContent('35')
    })
  })

  it('collapses when toggle is clicked again', async () => {
    const user = userEvent.setup()

    render(createElement(Leaderboard, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-toggle')).toBeInTheDocument()
    })

    // Open
    await user.click(screen.getByTestId('leaderboard-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-list')).toBeInTheDocument()
    })

    // Close
    await user.click(screen.getByTestId('leaderboard-toggle'))
    await waitFor(() => {
      expect(screen.queryByTestId('leaderboard-list')).not.toBeInTheDocument()
    })
  })

  it('can be opened via workspace store directly', async () => {
    useWorkspaceStore.getState().toggleLeaderboard()

    render(createElement(Leaderboard, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-list')).toBeInTheDocument()
    })
  })
})
