import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockChallenge, resetChallengeCounter } from '@/test/factories/challenge'
import { createMockAssignment, resetAssignmentCounter } from '@/test/factories/assignment'
import { createMockBase, resetBaseCounter } from '@/test/factories/base'
import { createMockTeam, resetTeamCounter } from '@/test/factories/team'
import { useWorkspaceStore } from '@/stores/workspace'
import { ChallengeDetail } from './ChallengeDetail'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const gameId = 'game-1'

describe('ChallengeDetail', () => {
  beforeEach(() => {
    resetChallengeCounter()
    resetAssignmentCounter()
    resetBaseCounter()
    resetTeamCounter()
    useWorkspaceStore.getState().reset()
  })

  it('renders challenge title in the form', async () => {
    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      const input = screen.getByTestId('challenge-title-input')
      expect(input).toHaveValue('Challenge Alpha')
    })
  })

  it('shows "Challenge not found" for invalid id', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([])
      }),
    )

    render(
      <ChallengeDetail challengeId="nonexistent" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByText('Challenge not found')).toBeInTheDocument()
    })
  })

  it('renders all form sections', async () => {
    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('challenge-detail')).toBeInTheDocument()
    })

    // Section headers
    expect(screen.getByText('Identity')).toBeInTheDocument()
    // "Content" appears as both section header and field label
    expect(screen.getAllByText('Content').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Scoring')).toBeInTheDocument()
    expect(screen.getByText('Assignment')).toBeInTheDocument()
    expect(screen.getByText('Operator Notes')).toBeInTheDocument()
    expect(screen.getByText('Location Bound')).toBeInTheDocument()
    expect(screen.getByText('Post-completion')).toBeInTheDocument()
  })

  it('shows answer type buttons', async () => {
    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('answer-type-text')).toBeInTheDocument()
      expect(screen.getByTestId('answer-type-file')).toBeInTheDocument()
      expect(screen.getByTestId('answer-type-none')).toBeInTheDocument()
    })
  })

  it('shows answer configuration only for text type', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({ id: 'ch-text', title: 'Text Q', answerType: 'text' }),
        ])
      }),
    )

    render(
      <ChallengeDetail challengeId="ch-text" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByText('Answer Configuration')).toBeInTheDocument()
      expect(screen.getByTestId('correct-answer-input')).toBeInTheDocument()
    })
  })

  it('hides answer configuration for file type', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({ id: 'ch-file', title: 'Photo Q', answerType: 'file' }),
        ])
      }),
    )

    render(
      <ChallengeDetail challengeId="ch-file" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('challenge-detail')).toBeInTheDocument()
    })

    expect(screen.queryByText('Answer Configuration')).not.toBeInTheDocument()
  })

  it('shows assigned base as clickable link', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({ id: 'challenge-1', title: 'Challenge Alpha' }),
        ])
      }),
      http.get('/api/games/:gameId/assignments', () => {
        return HttpResponse.json([
          createMockAssignment({ baseId: 'base-1', challengeId: 'challenge-1' }),
        ])
      }),
      http.get('/api/games/:gameId/bases', () => {
        return HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Start Base' }),
        ])
      }),
    )

    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('assigned-base-link')).toHaveTextContent('Start Base')
    })
  })

  it('clicking base link calls selectBase', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({ id: 'challenge-1', title: 'Challenge Alpha' }),
        ])
      }),
      http.get('/api/games/:gameId/assignments', () => {
        return HttpResponse.json([
          createMockAssignment({ baseId: 'base-1', challengeId: 'challenge-1' }),
        ])
      }),
      http.get('/api/games/:gameId/bases', () => {
        return HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Start Base' }),
        ])
      }),
    )

    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('assigned-base-link')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('assigned-base-link'))

    expect(useWorkspaceStore.getState().selectedBaseId).toBe('base-1')
  })

  it('shows "Assign to base" button when unassigned', async () => {
    server.use(
      http.get('/api/games/:gameId/assignments', () => {
        return HttpResponse.json([])
      }),
    )

    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(
        screen.getByText('Assign to base'),
      ).toBeInTheDocument()
    })
  })

  it('shows save button and can save', async () => {
    const user = userEvent.setup()

    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('save-challenge')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('save-challenge'))

    // Should not crash -- mutation fires
    await waitFor(() => {
      expect(screen.getByTestId('save-challenge')).toBeInTheDocument()
    })
  })

  it('toggles location bound', async () => {
    const user = userEvent.setup()

    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('location-bound-toggle')).toBeInTheDocument()
    })

    const toggle = screen.getByTestId('location-bound-toggle')

    // Default is false -- should not have primary styling
    expect(toggle).toHaveTextContent('Require physical presence')

    await user.click(toggle)

    // After toggle, the button should have primary classes
    expect(toggle.className).toContain('bg-primary/10')
  })

  it('toggles auto-validate', async () => {
    const user = userEvent.setup()

    render(
      <ChallengeDetail challengeId="challenge-1" gameId={gameId} />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByTestId('auto-validate-toggle')).toBeInTheDocument()
    })

    const toggle = screen.getByTestId('auto-validate-toggle')
    await user.click(toggle)

    expect(toggle.className).toContain('bg-primary/10')
  })
})
