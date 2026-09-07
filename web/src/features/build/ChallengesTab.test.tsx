import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockChallenge, resetChallengeCounter } from '@/test/factories/challenge'
import { resetAssignmentCounter } from '@/test/factories/assignment'
import { resetBaseCounter } from '@/test/factories/base'
import { resetTeamCounter } from '@/test/factories/team'
import { createMockTag } from '@/test/factories/tag'
import { useWorkspaceStore } from '@/stores/workspace'
import { ChallengesTab } from './ChallengesTab'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const gameId = 'game-1'

describe('ChallengesTab', () => {
  beforeEach(() => {
    resetChallengeCounter()
    resetAssignmentCounter()
    resetBaseCounter()
    resetTeamCounter()
    useWorkspaceStore.getState().reset()
  })

  it('renders challenge list from API', async () => {
    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Challenge Alpha')).toBeInTheDocument()
      expect(screen.getByText('Challenge Beta')).toBeInTheDocument()
      expect(screen.getByText('Challenge Gamma')).toBeInTheDocument()
    })
  })

  it('shows empty state when no challenges', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([])
      }),
    )

    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('No challenges yet')).toBeInTheDocument()
    })
  })

  it('filters challenges by search', async () => {
    const user = userEvent.setup()

    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Challenge Alpha')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search challenges...')
    await user.type(searchInput, 'Alpha')

    await waitFor(() => {
      expect(screen.getByText('Challenge Alpha')).toBeInTheDocument()
      expect(screen.queryByText('Challenge Beta')).not.toBeInTheDocument()
      expect(screen.queryByText('Challenge Gamma')).not.toBeInTheDocument()
    })
  })

  it('shows "no match" when search yields nothing', async () => {
    const user = userEvent.setup()

    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Challenge Alpha')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search challenges...')
    await user.type(searchInput, 'zzzzzzz')

    await waitFor(() => {
      expect(
        screen.getByText('No challenges match your search'),
      ).toBeInTheDocument()
    })
  })

  it('selects a challenge on click', async () => {
    const user = userEvent.setup()

    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Challenge Alpha')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('challenge-item-challenge-1'))

    expect(useWorkspaceStore.getState().selectedChallengeId).toBe('challenge-1')
  })

  it('shows detail panel when challenge is selected', async () => {
    useWorkspaceStore.getState().selectChallenge('challenge-1')

    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('challenge-detail')).toBeInTheDocument()
    })
  })

  it('shows empty detail state when no challenge selected', async () => {
    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByText('Select a challenge to view details'),
      ).toBeInTheDocument()
    })
  })

  it('shows unassigned warning for challenges without assignments', async () => {
    server.use(
      http.get('/api/games/:gameId/assignments', () => {
        return HttpResponse.json([])
      }),
    )

    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      const unassignedLabels = screen.getAllByText('Unassigned')
      expect(unassignedLabels.length).toBeGreaterThan(0)
    })
  })

  it('shows points for each challenge', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({ id: 'ch-1', title: 'C1', points: 25 }),
        ])
      }),
    )

    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('25pts')).toBeInTheDocument()
    })
  })

  it('shows answer type badge', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({ id: 'ch-1', title: 'TextChallenge', answerType: 'text' }),
          createMockChallenge({ id: 'ch-2', title: 'FileChallenge', answerType: 'file' }),
        ])
      }),
    )

    render(<ChallengesTab gameId={gameId} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('TextChallenge')).toBeInTheDocument()
      expect(screen.getByText('FileChallenge')).toBeInTheDocument()
    })

    // Should show badge labels
    expect(screen.getByText('Text')).toBeInTheDocument()
    expect(screen.getByText('File')).toBeInTheDocument()
  })
})

describe('ChallengesTab tag filter', () => {
  beforeEach(() => {
    resetChallengeCounter()
    useWorkspaceStore.getState().reset()
  })

  it('narrows the list to challenges carrying any chosen tag', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([
          createMockChallenge({ id: 'ch-1', title: 'Riddle', tagIds: ['tag-1'] }),
          createMockChallenge({ id: 'ch-2', title: 'Photo hunt', tagIds: ['tag-2'] }),
          createMockChallenge({ id: 'ch-3', title: 'Untagged' }),
        ]),
      ),
      http.get('/api/games/:gameId/tags', () =>
        HttpResponse.json([createMockTag({ id: 'tag-1', label: 'Important' }), createMockTag({ id: 'tag-2', label: 'Outdoor' })]),
      ),
    )
    render(createElement(ChallengesTab, { gameId }), { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText('Riddle')).toBeInTheDocument())

    await user.click(screen.getByTestId('filter-tag-tag-2'))
    expect(screen.getByText('Photo hunt')).toBeInTheDocument()
    expect(screen.queryByText('Riddle')).not.toBeInTheDocument()
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('filter-tag-tag-1'))
    expect(screen.getByText('Riddle')).toBeInTheDocument()
    expect(screen.getByText('Photo hunt')).toBeInTheDocument()
  })

  it('says which filter emptied the list', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/challenges', () => HttpResponse.json([createMockChallenge({ id: 'ch-1', title: 'Riddle' })])),
    )
    render(createElement(ChallengesTab, { gameId }), { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText('Riddle')).toBeInTheDocument())
    await user.click(screen.getByTestId('filter-tag-tag-1'))
    expect(screen.getByText('No challenges match the current filters — try clearing a filter.')).toBeInTheDocument()
  })

  it('hides the chips when the game has no tags', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => HttpResponse.json([createMockChallenge({ id: 'ch-1', title: 'Riddle' })])),
      http.get('/api/games/:gameId/tags', () => HttpResponse.json([])),
    )
    render(createElement(ChallengesTab, { gameId }), { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText('Riddle')).toBeInTheDocument())
    expect(screen.queryByTestId('quick-filters')).not.toBeInTheDocument()
  })
})
