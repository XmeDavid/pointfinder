import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { resetTeamCounter } from '@/test/factories/team'
import { createMockAssignment, resetAssignmentCounter } from '@/test/factories/assignment'
import { createMockBase, resetBaseCounter } from '@/test/factories/base'
import { createMockChallenge, resetChallengeCounter } from '@/test/factories/challenge'
import { createMockStage, resetStageCounter } from '@/test/factories/stage'
import { useWorkspaceStore } from '@/stores/workspace'
import { TeamDetail } from './TeamDetail'


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

    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument()
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

describe('TeamDetail player limit (OW-05)', () => {
  function limitFixture(maxPlayers: number | null, playerCount: number) {
    const puts: Array<Record<string, unknown>> = []
    let team = { id: 'team-1', gameId: 'game-1', name: 'Falcons', joinCode: 'FALC01', color: '#22c55e', maxPlayers }
    server.use(
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([team])),
      http.get('/api/games/:gameId/teams/:teamId/players', () => HttpResponse.json(
        Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, teamId: 'team-1', deviceId: `d${i}`, displayName: `Scout ${i}` })),
      )),
      http.put('/api/games/:gameId/teams/:teamId', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        puts.push(body)
        team = { ...team, maxPlayers: body.clearMaxPlayers ? null : (body.maxPlayers as number | undefined) ?? team.maxPlayers }
        return HttpResponse.json(team)
      }),
    )
    return puts
  }

  it('saves a limit and shows the team as full once it is reached', async () => {
    const user = userEvent.setup()
    const puts = limitFixture(null, 3)
    render(createElement(TeamDetail, { teamId: 'team-1', gameId: 'game-1' }), { wrapper: createWrapper() })
    const input = await screen.findByLabelText('Player limit')
    expect(input).toHaveValue(null)
    await user.type(input, '3')
    await user.click(screen.getByTestId('save-team'))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ name: 'Falcons', maxPlayers: 3 })
    expect(await screen.findByTestId('team-full-badge')).toHaveTextContent('Full')
    expect(screen.getByText('Members (3 of 3)')).toBeInTheDocument()
  })

  it('clears the limit explicitly and never sends an invalid one', async () => {
    const user = userEvent.setup()
    const puts = limitFixture(4, 5)
    render(createElement(TeamDetail, { teamId: 'team-1', gameId: 'game-1' }), { wrapper: createWrapper() })
    const input = await screen.findByLabelText('Player limit')
    await waitFor(() => expect(input).toHaveValue(4))
    expect(screen.getByTestId('team-over-limit')).toHaveTextContent('already has 5 players')
    await user.clear(input)
    await user.type(input, '0')
    expect(screen.getByText(/whole number from 1 to 500/)).toBeInTheDocument()
    expect(screen.getByTestId('save-team')).toBeDisabled()
    await user.clear(input)
    await user.click(screen.getByTestId('save-team'))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ clearMaxPlayers: true })
    expect(puts[0]).not.toHaveProperty('maxPlayers')
  })
})
