import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase, resetBaseCounter } from '@/test/factories/base'
import { createMockGame } from '@/test/factories/game'
import { createMockChallenge, resetChallengeCounter } from '@/test/factories/challenge'
import { createMockTeam, resetTeamCounter } from '@/test/factories/team'
import { createMockAssignment, resetAssignmentCounter } from '@/test/factories/assignment'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAuthStore } from '@/lib/auth/store'
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
      expect(screen.getByTestId('readiness-count')).toHaveTextContent('10/10')
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
    expect(screen.getByText('NFC bases linked (1/1)')).toBeInTheDocument()
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

  it('passes NFC readiness vacuously when no base uses NFC', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', checkInMethod: 'QR', nfcLinked: false, hidden: false }),
        ]),
      ),
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([createMockChallenge({ id: 'c1' })]),
      ),
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([createMockTeam({ id: 't1' })])),
      http.get('/api/games/:gameId/assignments', () =>
        HttpResponse.json([createMockAssignment({ baseId: 'b1', challengeId: 'c1' })]),
      ),
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        HttpResponse.json({ complete: true, errors: [] }),
      ),
    )

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-count')).toHaveTextContent('10/10')
    })

    await user.click(screen.getByTestId('readiness-toggle'))
    expect(await screen.findByText('NFC bases linked (0/0)')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-legacy-note')).toHaveTextContent(
      'The legacy iOS and Android apps cannot complete QR or location bases.',
    )
  })

  it('fails location bases sitting at 0,0 and flags overlapping rings', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', defaultCheckInRadiusM: 100 })),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', checkInMethod: 'LOCATION', lat: 0, lng: 0 }),
          createMockBase({ id: 'b2', checkInMethod: 'LOCATION', lat: 38.7, lng: -9.1 }),
          createMockBase({ id: 'b3', checkInMethod: 'LOCATION', lat: 38.7001, lng: -9.1001 }),
        ]),
      ),
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([createMockChallenge({ id: 'c1' })]),
      ),
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([createMockTeam({ id: 't1' })])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        HttpResponse.json({ complete: true, errors: [] }),
      ),
    )

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('readiness-toggle'))

    expect(await screen.findByText('Location bases have coordinates (2/3)')).toBeInTheDocument()
    expect(screen.getByText('Location rings do not overlap')).toBeInTheDocument()
    expect(screen.queryByTestId('go-live-btn')).not.toBeInTheDocument()
  })

  it('fails a location-bound challenge nobody assigned, and passes it once pinned or assigned', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', nfcLinked: true }),
          createMockBase({ id: 'b2', nfcLinked: true, fixedChallengeId: 'c2' }),
        ]),
      ),
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([
          createMockChallenge({ id: 'c1', locationBound: true }),
          createMockChallenge({ id: 'c2', locationBound: true }),
          createMockChallenge({ id: 'c3', locationBound: true }),
        ]),
      ),
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([createMockTeam({ id: 't1' })])),
      http.get('/api/games/:gameId/assignments', () =>
        HttpResponse.json([createMockAssignment({ baseId: 'b1', challengeId: 'c1' })]),
      ),
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        HttpResponse.json({ complete: true, errors: [] }),
      ),
    )

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('readiness-toggle'))

    // c1 is assigned, c2 is pinned to b2, c3 is neither: the server would
    // reject go-live, so the checklist must say so instead of showing green.
    expect(
      await screen.findByText('Location-bound challenges assigned to a base (2/3)'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('go-live-btn')).not.toBeInTheDocument()
  })

  it('rejects a location radius outside 5..200', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({
            id: 'b1',
            checkInMethod: 'LOCATION',
            lat: 38.7,
            lng: -9.1,
            checkInRadiusM: 400,
          }),
        ]),
      ),
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([createMockChallenge({ id: 'c1' })]),
      ),
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([createMockTeam({ id: 't1' })])),
      http.get('/api/games/:gameId/assignments', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        HttpResponse.json({ complete: true, errors: [] }),
      ),
    )

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('readiness-toggle'))

    expect(
      await screen.findByText('Location radii between 5 and 200 m (0/1)'),
    ).toBeInTheDocument()
  })

  it('hides the legacy-apps note when every base is NFC', async () => {
    const user = userEvent.setup()
    setupFullyReadyHandlers()

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('readiness-toggle')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('readiness-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('readiness-checklist')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('readiness-legacy-note')).not.toBeInTheDocument()
  })

})

describe('ReadinessIndicator expansion lives in the workspace store', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset()
    resetBaseCounter()
    resetChallengeCounter()
    resetTeamCounter()
    resetAssignmentCounter()
  })

  it('renders the checklist when the store says expanded, without a click', async () => {
    setupFullyReadyHandlers()
    useWorkspaceStore.getState().setReadinessExpanded(true)

    render(<ReadinessIndicator gameId="game-1" gameStatus="setup" />, { wrapper: createWrapper() })

    expect(await screen.findByTestId('readiness-checklist')).toBeInTheDocument()
  })

  it('writes the expansion back to the store when the header is pressed', async () => {
    setupFullyReadyHandlers()
    const user = userEvent.setup()

    render(<ReadinessIndicator gameId="game-1" gameStatus="setup" />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId('readiness-toggle'))
    await waitFor(() => expect(useWorkspaceStore.getState().readinessExpanded).toBe(true))
  })
})

describe('ReadinessIndicator location check-in entitlement', () => {
  afterEach(() => useAuthStore.setState({ isAuthenticated: false, accessToken: null }))

  function setupLocationGameOnPlan(locationCheckIn: boolean) {
    const accessToken = `header.${btoa(JSON.stringify({ exp: 4102444800 })).replace(/=+$/, '')}.signature`
    useAuthStore.setState({ isAuthenticated: true, accessToken })
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({
            id: 'b1',
            checkInMethod: 'LOCATION',
            checkInRadiusM: 20,
            lat: 41.1,
            lng: -8.6,
            nfcLinked: false,
            hidden: false,
          }),
        ]),
      ),
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([createMockChallenge({ id: 'c1' })]),
      ),
      http.get('/api/games/:gameId/teams', () => HttpResponse.json([createMockTeam({ id: 't1' })])),
      http.get('/api/games/:gameId/assignments', () =>
        HttpResponse.json([createMockAssignment({ baseId: 'b1', challengeId: 'c1' })]),
      ),
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        HttpResponse.json({ complete: true, errors: [] }),
      ),
      http.get('/api/quota/personal', () =>
        HttpResponse.json({
          context: 'personal',
          orgId: null,
          tier: locationCheckIn ? 'pro' : 'free',
          limits: {
            maxActiveGames: 1,
            maxOperatorsPerGame: 1,
            maxBasesPerGame: 25,
            maxFileSizeBytes: 1,
            maxMembers: null,
            maxLiveGames: null,
            maxPlayersPerGame: 50,
            maxResourceStorageBytes: 0,
            locationCheckIn,
          },
          usage: {
            currentActiveGames: 0,
            currentMembers: null,
            currentLiveGames: null,
            currentResourceStorageBytes: 0,
          },
          overrides: null,
        }),
      ),
    )
  }

  it('adds a failing plan check when a free game holds a location base', async () => {
    const user = userEvent.setup()
    setupLocationGameOnPlan(false)

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText(/items? remaining/)).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('readiness-toggle'))
    expect(await screen.findByText('Location check-in included in your plan')).toBeInTheDocument()
  })

  it('shows no plan check on a paid plan', async () => {
    setupLocationGameOnPlan(true)

    render(createElement(ReadinessIndicator, { gameId: 'game-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Ready to launch')).toBeInTheDocument()
    })
    expect(screen.queryByText('Location check-in included in your plan')).toBeNull()
  })
})
