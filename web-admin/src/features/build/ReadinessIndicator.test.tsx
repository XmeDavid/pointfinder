import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase, resetBaseCounter } from '@/test/factories/base'
import { createMockChallenge, resetChallengeCounter } from '@/test/factories/challenge'
import { createMockTeam, resetTeamCounter } from '@/test/factories/team'
import { createMockAssignment, resetAssignmentCounter } from '@/test/factories/assignment'
import { useWorkspaceStore } from '@/stores/workspace'
import ReadinessIndicator from './ReadinessIndicator'

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

function setupFullyReadyHandlers() {
  server.use(
    http.get('/api/games/:gameId/bases', () =>
      HttpResponse.json([
        createMockBase({ id: 'b1', nfcLinked: true, hidden: false }),
      ]),
    ),
    http.get('/api/games/:gameId/challenges', () =>
      HttpResponse.json([createMockChallenge({ id: 'c1' })]),
    ),
    http.get('/api/games/:gameId/teams', () =>
      HttpResponse.json([createMockTeam({ id: 't1' })]),
    ),
    http.get('/api/games/:gameId/assignments', () =>
      HttpResponse.json([
        createMockAssignment({ baseId: 'b1', challengeId: 'c1' }),
      ]),
    ),
    http.get('/api/games/:gameId/team-variables/completeness', () =>
      HttpResponse.json({ complete: true, errors: [] }),
    ),
  )
}

function setupPartialHandlers() {
  server.use(
    http.get('/api/games/:gameId/bases', () =>
      HttpResponse.json([
        createMockBase({ id: 'b1', nfcLinked: false, hidden: false }),
      ]),
    ),
    http.get('/api/games/:gameId/challenges', () =>
      HttpResponse.json([createMockChallenge({ id: 'c1' })]),
    ),
    http.get('/api/games/:gameId/teams', () => HttpResponse.json([])),
    http.get('/api/games/:gameId/assignments', () =>
      HttpResponse.json([
        createMockAssignment({ baseId: 'b1', challengeId: 'c1' }),
      ]),
    ),
    http.get('/api/games/:gameId/team-variables/completeness', () =>
      HttpResponse.json({ complete: true, errors: [] }),
    ),
  )
}

beforeEach(() => {
  resetBaseCounter()
  resetChallengeCounter()
  resetTeamCounter()
  resetAssignmentCounter()
  useWorkspaceStore.getState().reset()
})

describe('ReadinessIndicator', () => {
  it('renders the progress ring with correct count', async () => {
    setupFullyReadyHandlers()

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-count')).toHaveTextContent('7/7')
    })
  })

  it('shows "Ready to launch" when all checks pass', async () => {
    setupFullyReadyHandlers()

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Ready to launch')).toBeInTheDocument()
    })
  })

  it('shows remaining count when checks fail', async () => {
    setupPartialHandlers()

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText(/items remaining/)).toBeInTheDocument()
    })
  })

  it('expands checklist on click', async () => {
    const user = userEvent.setup()
    setupFullyReadyHandlers()

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('readiness-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('readiness-checklist')).toBeInTheDocument()
    })

    expect(screen.getByText('At least one base')).toBeInTheDocument()
    expect(screen.getByText('At least one challenge')).toBeInTheDocument()
    expect(screen.getByText('At least one team')).toBeInTheDocument()
    expect(screen.getByText('All bases have NFC')).toBeInTheDocument()
    expect(screen.getByText('All assignments valid')).toBeInTheDocument()
    expect(screen.getByText('Variables complete')).toBeInTheDocument()
  })

  it('shows Go Live button when all checks pass', async () => {
    const user = userEvent.setup()
    setupFullyReadyHandlers()

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('readiness-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('go-live-btn')).toBeInTheDocument()
    })
  })

  it('does not show Go Live button when checks fail', async () => {
    const user = userEvent.setup()
    setupPartialHandlers()

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('readiness-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('readiness-checklist')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('go-live-btn')).not.toBeInTheDocument()
  })

  it('calls updateGameStatus on Go Live click', async () => {
    const user = userEvent.setup()
    let statusCalled = false
    let statusBody: Record<string, unknown> = {}

    setupFullyReadyHandlers()

    server.use(
      http.patch('/api/games/:gameId/status', async ({ request }) => {
        statusCalled = true
        statusBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 'game-1', status: 'live' })
      }),
    )

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('readiness-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('go-live-btn')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('go-live-btn'))

    await waitFor(() => {
      expect(statusCalled).toBe(true)
    })

    expect(statusBody.status).toBe('live')
  })

  it('marks failed checks with fail indicator', async () => {
    const user = userEvent.setup()
    setupPartialHandlers()

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('readiness-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('readiness-checklist')).toBeInTheDocument()
    })

    const failItems = screen.getAllByTestId('check-fail')
    expect(failItems.length).toBeGreaterThan(0)
  })

  it('counts checks correctly with no data', async () => {
    server.use(
      http.get('/api/games/:gameId/bases', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/challenges', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        HttpResponse.json({ complete: true, errors: [] }),
      ),
    )

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      // 3 fail (no base, no challenge, no team), NFC check also fails when no bases
      // but "All bases have NFC" passes when 0 visible non-hidden bases?
      // Actually: baseList.length > 0 && ... so it fails
      expect(screen.getByText(/items remaining/)).toBeInTheDocument()
    })
  })
})
