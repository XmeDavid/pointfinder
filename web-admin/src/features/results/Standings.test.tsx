import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import Standings from './Standings'

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

describe('Standings', () => {
  it('renders ranked teams from leaderboard', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/leaderboard', () => {
        return HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'Eagles',
            color: '#ef4444',
            points: 100,
            completedChallenges: 8,
          },
          {
            teamId: 'team-2',
            teamName: 'Hawks',
            color: '#3b82f6',
            points: 75,
            completedChallenges: 6,
          },
          {
            teamId: 'team-3',
            teamName: 'Wolves',
            color: '#22c55e',
            points: 50,
            completedChallenges: 4,
          },
        ])
      }),
    )

    render(createElement(Standings, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Eagles')).toBeInTheDocument()
    })

    expect(screen.getByText('Hawks')).toBeInTheDocument()
    expect(screen.getByText('Wolves')).toBeInTheDocument()
  })

  it('shows scores in bold', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/leaderboard', () => {
        return HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'Eagles',
            color: '#ef4444',
            points: 100,
            completedChallenges: 8,
          },
        ])
      }),
    )

    render(createElement(Standings, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument()
    })

    const scoreEl = screen.getByText('100')
    expect(scoreEl.className).toContain('font-bold')
  })

  it('applies gold border to rank 1', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/leaderboard', () => {
        return HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'First Place',
            color: '#ef4444',
            points: 100,
            completedChallenges: 10,
          },
          {
            teamId: 'team-2',
            teamName: 'Second Place',
            color: '#3b82f6',
            points: 80,
            completedChallenges: 8,
          },
          {
            teamId: 'team-3',
            teamName: 'Third Place',
            color: '#22c55e',
            points: 60,
            completedChallenges: 6,
          },
          {
            teamId: 'team-4',
            teamName: 'Fourth Place',
            color: '#eab308',
            points: 40,
            completedChallenges: 4,
          },
        ])
      }),
    )

    render(createElement(Standings, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('standing-row-1')).toBeInTheDocument()
    })

    // Top 3 have special border colors
    const row1 = screen.getByTestId('standing-row-1')
    const row2 = screen.getByTestId('standing-row-2')
    const row3 = screen.getByTestId('standing-row-3')
    const row4 = screen.getByTestId('standing-row-4')

    expect(row1.className).toContain('#eab308') // gold
    expect(row2.className).toContain('#a1a1aa') // silver
    expect(row3.className).toContain('#cd7f32') // bronze
    expect(row4.className).toContain('border-transparent') // no special styling
  })

  it('displays team color dots', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/leaderboard', () => {
        return HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'Red Team',
            color: '#ef4444',
            points: 50,
            completedChallenges: 5,
          },
        ])
      }),
    )

    render(createElement(Standings, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Red Team')).toBeInTheDocument()
    })

    // Check the color dot is present (sibling of team name)
    const teamName = screen.getByText('Red Team')
    const colorDot = teamName.parentElement?.querySelector('.rounded-full')
    expect(colorDot).toBeTruthy()
    expect((colorDot as HTMLElement).style.backgroundColor).toBe(
      'rgb(239, 68, 68)',
    )
  })

  it('shows empty state when no teams', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/leaderboard', () => {
        return HttpResponse.json([])
      }),
    )

    render(createElement(Standings, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('No teams found.')).toBeInTheDocument()
    })
  })

  it('sorts teams by score descending', async () => {
    server.use(
      http.get('/api/games/:gameId/monitoring/leaderboard', () => {
        // Return in wrong order to verify sorting
        return HttpResponse.json([
          {
            teamId: 'team-low',
            teamName: 'Low Team',
            color: '#22c55e',
            points: 10,
            completedChallenges: 1,
          },
          {
            teamId: 'team-high',
            teamName: 'High Team',
            color: '#ef4444',
            points: 90,
            completedChallenges: 9,
          },
        ])
      }),
    )

    render(createElement(Standings, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('High Team')).toBeInTheDocument()
    })

    // High Team should be rank 1
    const row1 = screen.getByTestId('standing-row-1')
    expect(row1.textContent).toContain('High Team')

    const row2 = screen.getByTestId('standing-row-2')
    expect(row2.textContent).toContain('Low Team')
  })
})
