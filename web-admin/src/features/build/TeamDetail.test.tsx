import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockTeam, resetTeamCounter } from '@/test/factories/team'
import { createMockAssignment, resetAssignmentCounter } from '@/test/factories/assignment'
import { createMockBase, resetBaseCounter } from '@/test/factories/base'
import { createMockChallenge, resetChallengeCounter } from '@/test/factories/challenge'
import { createMockStage, resetStageCounter } from '@/test/factories/stage'
import { useWorkspaceStore } from '@/stores/workspace'
import { TeamDetail } from './TeamDetail'
import type { Player } from '@/types/v2'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const gameId = 'game-1'

describe('TeamDetail', () => {
  beforeEach(() => {
    resetTeamCounter()
    resetAssignmentCounter()
    resetBaseCounter()
    resetChallengeCounter()
    resetStageCounter()
    useWorkspaceStore.getState().reset()
  })

  it('renders team name in the form', async () => {
    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      const input = screen.getByTestId('team-name-input')
      expect(input).toHaveValue('Team Alpha')
    })
  })

  it('shows "Team not found" for invalid id', async () => {
    server.use(
      http.get('/api/games/:gameId/teams', () => {
        return HttpResponse.json([])
      }),
    )

    render(
      <TeamDetail teamId="nonexistent" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByText('Team not found')).toBeInTheDocument()
    })
  })

  it('renders all form sections', async () => {
    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('team-detail')).toBeInTheDocument()
    })

    expect(screen.getByText('Identity')).toBeInTheDocument()
    expect(screen.getByText(/Members/)).toBeInTheDocument()
    expect(screen.getByText('Journey Preview')).toBeInTheDocument()
    expect(screen.getByText('Team Variables')).toBeInTheDocument()
  })

  it('shows team color', async () => {
    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('team-color')).toBeInTheDocument()
    })
  })

  it('shows join code with copy button', async () => {
    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('team-join-code')).toBeInTheDocument()
      expect(screen.getByTestId('copy-join-code')).toBeInTheDocument()
    })
  })

  it('renders player list', async () => {
    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      // MSW handler returns Alice and Bob for team-1
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
  })

  it('shows remove button for each player', async () => {
    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('remove-player-player-1')).toBeInTheDocument()
      expect(screen.getByTestId('remove-player-player-2')).toBeInTheDocument()
    })
  })

  it('shows "No members yet" when no players', async () => {
    server.use(
      http.get('/api/games/:gameId/teams/:teamId/players', () => {
        return HttpResponse.json([])
      }),
    )

    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByText('No members yet')).toBeInTheDocument()
    })
  })

  it('shows team variables editor', async () => {
    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByText(/Variables/i)).toBeInTheDocument()
    })
  })

  it('shows journey preview with assignments', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () => {
        return HttpResponse.json([
          createMockStage({ id: 'stage-1', name: 'Round 1', orderIndex: 0 }),
        ])
      }),
      http.get('/api/games/:gameId/bases', () => {
        return HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Forest Base', stageId: 'stage-1' }),
        ])
      }),
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({ id: 'challenge-1', title: 'Find the Tree', points: 20 }),
        ])
      }),
      http.get('/api/games/:gameId/assignments', () => {
        return HttpResponse.json([
          createMockAssignment({ baseId: 'base-1', challengeId: 'challenge-1' }),
        ])
      }),
    )

    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('journey-preview')).toBeInTheDocument()
    })

    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Forest Base')).toBeInTheDocument()
    expect(screen.getByText('Find the Tree')).toBeInTheDocument()
    expect(screen.getByText('20 pts')).toBeInTheDocument()
  })

  it('shows "No assignments yet" when no assignments', async () => {
    server.use(
      http.get('/api/games/:gameId/assignments', () => {
        return HttpResponse.json([])
      }),
      http.get('/api/games/:gameId/stages', () => {
        return HttpResponse.json([])
      }),
    )

    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('no-journey')).toHaveTextContent(
        'No assignments yet',
      )
    })
  })

  it('shows save button', async () => {
    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('save-team')).toBeInTheDocument()
    })
  })

  it('can click save', async () => {
    const user = userEvent.setup()

    render(
      <TeamDetail teamId="team-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('save-team')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('save-team'))

    // Should not crash
    await waitFor(() => {
      expect(screen.getByTestId('save-team')).toBeInTheDocument()
    })
  })
})
