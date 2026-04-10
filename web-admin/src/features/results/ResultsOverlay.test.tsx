import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import ResultsOverlay from './ResultsOverlay'

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

describe('ResultsOverlay', () => {
  it('renders all three tabs', async () => {
    render(createElement(ResultsOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    expect(screen.getByTestId('tab-standings')).toBeInTheDocument()
    expect(screen.getByTestId('tab-breakdown')).toBeInTheDocument()
    expect(screen.getByTestId('tab-statistics')).toBeInTheDocument()
  })

  it('renders export buttons', async () => {
    render(createElement(ResultsOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    expect(screen.getByTestId('export-csv')).toBeInTheDocument()
    expect(screen.getByTestId('export-detailed')).toBeInTheDocument()
    expect(screen.getByTestId('export-audit')).toBeInTheDocument()
  })

  it('shows standings tab content by default', async () => {
    render(createElement(ResultsOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('standings')).toBeInTheDocument()
    })
  })

  it('switches to breakdown tab on click', async () => {
    const user = userEvent.setup()

    render(createElement(ResultsOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await user.click(screen.getByTestId('tab-breakdown'))

    await waitFor(() => {
      expect(screen.getByTestId('team-breakdown')).toBeInTheDocument()
    })
  })

  it('switches to statistics tab on click', async () => {
    const user = userEvent.setup()

    render(createElement(ResultsOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await user.click(screen.getByTestId('tab-statistics'))

    await waitFor(() => {
      expect(screen.getByTestId('game-statistics')).toBeInTheDocument()
    })
  })

  it('highlights active tab', async () => {
    render(createElement(ResultsOverlay, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    const standingsTab = screen.getByTestId('tab-standings')
    const breakdownTab = screen.getByTestId('tab-breakdown')

    // Standings is active by default
    expect(standingsTab.className).toContain('text-primary')
    expect(breakdownTab.className).not.toContain('text-primary')
  })
})
