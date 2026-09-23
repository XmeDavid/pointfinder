import { describe, it, expect, beforeEach } from 'vitest'
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

/** One NFC base without a tag and no team: two blockers, everything else passes. */
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

function renderIndicator(gameStatus?: string) {
  return render(createElement(ReadinessIndicator, { gameId: 'game-1', gameStatus }), {
    wrapper: createWrapper(),
  })
}

beforeEach(() => {
  resetBaseCounter()
  resetChallengeCounter()
  resetTeamCounter()
  resetAssignmentCounter()
  useWorkspaceStore.getState().reset()
})

describe('ReadinessIndicator when the game is ready', () => {
  it('omits completed progress when only launching remains', async () => {
    setupFullyReadyHandlers()
    renderIndicator()
    expect(await screen.findByTestId('go-live-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('readiness-ring')).not.toBeInTheDocument()
  })

  it('offers Go live directly, with no checklist to open', async () => {
    setupFullyReadyHandlers()
    renderIndicator()

    expect(await screen.findByTestId('go-live-btn')).toBeInTheDocument()
    expect(screen.getByTestId('go-live-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('readiness-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('readiness-checklist')).not.toBeInTheDocument()
    expect(screen.queryByTestId('check-fail')).not.toBeInTheDocument()
    expect(screen.queryByTestId('check-pass')).not.toBeInTheDocument()
  })

  it('goes live through the server and only then switches to command mode', async () => {
    const user = userEvent.setup()
    let statusBody: Record<string, unknown> = {}
    setupFullyReadyHandlers()
    server.use(
      http.patch('/api/games/:gameId/status', async ({ request }) => {
        statusBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 'game-1', status: 'live' })
      }),
    )
    renderIndicator()

    await user.click(await screen.findByTestId('go-live-btn'))

    await waitFor(() => expect(statusBody.status).toBe('live'))
    await waitFor(() => expect(useWorkspaceStore.getState().mode).toBe('command'))
  })

  it('keeps the game in setup and shows what the server said when the launch fails, then lets the operator retry', async () => {
    const user = userEvent.setup()
    let launches = 0
    setupFullyReadyHandlers()
    server.use(
      http.patch('/api/games/:gameId/status', () => {
        launches += 1
        if (launches === 1) {
          return HttpResponse.json({ message: 'Game changed; check setup again' }, { status: 409 })
        }
        return HttpResponse.json({ id: 'game-1', status: 'live' })
      }),
    )
    renderIndicator()

    await user.click(await screen.findByTestId('go-live-btn'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Game changed; check setup again')
    expect(useWorkspaceStore.getState().mode).toBe('build')

    await user.click(screen.getByTestId('go-live-btn'))
    await waitFor(() => expect(useWorkspaceStore.getState().mode).toBe('command'))
    expect(launches).toBe(2)
  })

  it('still shows the legacy-apps note when a base is not NFC, without listing passed checks', async () => {
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
    renderIndicator()

    expect(await screen.findByTestId('go-live-btn')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-legacy-note')).toHaveTextContent(
      'The legacy iOS and Android apps cannot complete QR or location bases.',
    )
    expect(screen.queryByText('NFC bases linked (0/0)')).not.toBeInTheDocument()
  })

  it('hides the legacy-apps note when every base is NFC', async () => {
    setupFullyReadyHandlers()
    renderIndicator()
    expect(await screen.findByTestId('go-live-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('readiness-legacy-note')).not.toBeInTheDocument()
  })

  it('notes that the legacy apps cannot answer a linked choice question', async () => {
    setupFullyReadyHandlers()
    server.use(
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([createMockChallenge({ id: 'c1', answerType: 'single_choice', autoValidate: true,
          choiceOptions: [{ id: 'a', text: 'Oak', correct: true }, { id: 'b', text: 'Pine', correct: false }] })]),
      ),
    )
    renderIndicator()
    expect(await screen.findByTestId('go-live-btn')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-legacy-choice-note')).toHaveTextContent('cannot answer single- or multiple-choice questions')
    expect(screen.queryByTestId('readiness-legacy-note')).not.toBeInTheDocument()
  })

  it('is hidden once the game is live', async () => {
    setupFullyReadyHandlers()
    renderIndicator('live')
    expect(screen.queryByTestId('readiness-indicator')).not.toBeInTheDocument()
  })
})

describe('ReadinessIndicator with blockers', () => {
  it('counts what remains and lists only the failing checks', async () => {
    const user = userEvent.setup()
    setupPartialHandlers()
    renderIndicator()

    expect(await screen.findByText('2 items remaining')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-count')).toHaveTextContent('8/10')
    expect(screen.queryByTestId('go-live-btn')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('readiness-toggle'))
    expect(await screen.findByTestId('readiness-checklist')).toBeInTheDocument()
    expect(screen.getAllByTestId('check-fail')).toHaveLength(2)
    expect(screen.queryByTestId('check-pass')).not.toBeInTheDocument()
    expect(screen.getByText('At least one team')).toBeInTheDocument()
    expect(screen.getByText('NFC bases linked (0/1)')).toBeInTheDocument()
    expect(screen.queryByText('At least one base')).not.toBeInTheDocument()
    expect(screen.queryByText('All assignments valid')).not.toBeInTheDocument()
    expect(screen.queryByText('Variables complete')).not.toBeInTheDocument()
  })

  it('opens the editor that fixes a blocker', async () => {
    const user = userEvent.setup()
    setupPartialHandlers()
    useWorkspaceStore.getState().setMode('command')
    useWorkspaceStore.getState().setSettingsPanelOpen(true)
    renderIndicator()

    await user.click(await screen.findByTestId('readiness-toggle'))
    await user.click(await screen.findByText('At least one team'))

    const state = useWorkspaceStore.getState()
    expect(state.mode).toBe('build')
    expect(state.drawerOpen).toBe(true)
    expect(state.drawerTab).toBe('teams')
    expect(state.settingsPanelOpen).toBe(false)

    await user.click(screen.getByText('NFC bases linked (0/1)'))
    expect(useWorkspaceStore.getState().drawerTab).toBe('nfc')
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
    renderIndicator()
    // No base, no challenge, no team; the per-base checks pass vacuously.
    expect(await screen.findByText('3 items remaining')).toBeInTheDocument()
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
    renderIndicator()

    await user.click(await screen.findByTestId('readiness-toggle'))

    expect(await screen.findByText('Location bases have coordinates (2/3)')).toBeInTheDocument()
    expect(screen.getByText('Location rings do not overlap')).toBeInTheDocument()
    expect(screen.queryByTestId('go-live-btn')).not.toBeInTheDocument()

    // Both are fixed on the bases themselves.
    await user.click(screen.getByText('Location rings do not overlap'))
    expect(useWorkspaceStore.getState().drawerTab).toBe('bases')
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
    renderIndicator()

    await user.click(await screen.findByTestId('readiness-toggle'))

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
    renderIndicator()

    await user.click(await screen.findByTestId('readiness-toggle'))
    expect(
      await screen.findByText('Location radii between 5 and 200 m (0/1)'),
    ).toBeInTheDocument()
  })
})

describe('ReadinessIndicator while the checks cannot be trusted', () => {
  it('shows a loading state and no Go live while the data is still arriving', async () => {
    setupFullyReadyHandlers()
    server.use(
      http.get('/api/games/:gameId/team-variables/completeness', () => new Promise(() => {})),
    )
    renderIndicator()

    expect(await screen.findByTestId('readiness-loading')).toBeInTheDocument()
    expect(screen.getByText('Checking readiness…')).toBeInTheDocument()
    expect(screen.queryByTestId('go-live-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('readiness-toggle')).not.toBeInTheDocument()
    expect(screen.queryByText('Ready to launch')).not.toBeInTheDocument()
  })

  it('shows an error with a retry instead of a ready state when a check fails to load', async () => {
    const user = userEvent.setup()
    let available = false
    setupFullyReadyHandlers()
    server.use(
      http.get('/api/games/:gameId/team-variables/completeness', () =>
        available
          ? HttpResponse.json({ complete: true, errors: [] })
          : HttpResponse.json({ message: 'Variables unavailable' }, { status: 503 }),
      ),
    )
    renderIndicator()

    expect(await screen.findByTestId('readiness-error')).toBeInTheDocument()
    expect(screen.queryByTestId('go-live-btn')).not.toBeInTheDocument()
    expect(screen.queryByText('Ready to launch')).not.toBeInTheDocument()

    available = true
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('go-live-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('readiness-error')).not.toBeInTheDocument()
  })
})

describe('ReadinessIndicator expansion lives in the workspace store', () => {
  it('renders the checklist when the store says expanded, without a click', async () => {
    setupPartialHandlers()
    useWorkspaceStore.getState().setReadinessExpanded(true)

    render(<ReadinessIndicator gameId="game-1" gameStatus="setup" />, { wrapper: createWrapper() })

    expect(await screen.findByTestId('readiness-checklist')).toBeInTheDocument()
  })

  it('writes the expansion back to the store when the header is pressed', async () => {
    setupPartialHandlers()
    const user = userEvent.setup()

    render(<ReadinessIndicator gameId="game-1" gameStatus="setup" />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId('readiness-toggle'))
    await waitFor(() => expect(useWorkspaceStore.getState().readinessExpanded).toBe(true))
  })
})

describe('ReadinessIndicator location check-in entitlement', () => {
  function setupLocationGameOnPlan(locationCheckInAllowed: boolean) {
    server.use(
      http.get('/api/games/:id', ({ params }) =>
        HttpResponse.json(createMockGame({ id: String(params.id), locationCheckInAllowed })),
      ),
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
    )
  }

  it('adds a failing plan check that opens the game settings', async () => {
    const user = userEvent.setup()
    setupLocationGameOnPlan(false)
    useWorkspaceStore.getState().openDrawer('bases')
    renderIndicator()

    expect(await screen.findByText('1 item remaining')).toBeInTheDocument()
    await user.click(screen.getByTestId('readiness-toggle'))
    await user.click(await screen.findByText('Location check-in included in your plan'))

    const state = useWorkspaceStore.getState()
    expect(state.settingsPanelOpen).toBe(true)
    expect(state.drawerOpen).toBe(false)
  })

  it('shows no plan check when the game includes it', async () => {
    setupLocationGameOnPlan(true)
    renderIndicator()

    expect(await screen.findByTestId('go-live-btn')).toBeInTheDocument()
    expect(screen.queryByText('Location check-in included in your plan')).toBeNull()
  })
})
