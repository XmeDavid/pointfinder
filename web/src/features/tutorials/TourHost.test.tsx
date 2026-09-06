import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { INPUT_SETTLE_MS, TourHost } from './TourHost'
import { useTourStore } from './store'
import { SCENARIOS, registerScenario } from './scenarios'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAuthStore } from '@/lib/auth/store'
import type { Scenario } from './types'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const prepare = vi.fn()

const probe: Scenario = {
  id: 'first-game',
  entry: 'setup-game',
  title: 'tutorials.scenarios.firstGame.title',
  blurb: 'tutorials.scenarios.firstGame.blurb',
  steps: [
    {
      id: 'type-a-name',
      anchor: 'probe-name',
      done: { kind: 'predicate', test: (s) => s.field('probe-name').value.length > 0 },
      copy: { title: 'tutorials.common.next', body: 'tutorials.common.gotIt' },
    },
    {
      id: 'read-this',
      anchor: 'probe-missing',
      route: 'workspace',
      prepare,
      done: { kind: 'ack' },
      copy: { title: 'tutorials.common.resume', body: 'tutorials.common.close' },
    },
    {
      id: 'only-when-flagged',
      anchor: 'probe-name',
      when: (s) => s.laterSteps.has('flag'),
      done: { kind: 'ack' },
      copy: { title: 'tutorials.common.later', body: 'tutorials.common.close' },
    },
    {
      id: 'finish',
      anchor: '',
      done: { kind: 'ack' },
      copy: { title: 'tutorials.common.gotIt', body: 'tutorials.common.close' },
    },
  ],
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function Harness({ children, path }: { children: ReactNode; path: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        {children}
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderHost(path = '/game/game-1') {
  return render(
    <Harness path={path}>
      <input data-testid="probe-name" defaultValue="" />
      <TourHost />
    </Harness>,
  )
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 10, left: 10, right: 210, bottom: 50, width: 200, height: 40, x: 10, y: 10, toJSON: () => ({}),
  } as DOMRect)
  prepare.mockClear()
  useTourStore.getState().reset()
  useWorkspaceStore.getState().reset()
  // Matches the MSW refresh handler's user, and carries a token so no refresh is attempted.
  useAuthStore.setState({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test Operator', role: 'operator', createdAt: '2026-01-01T00:00:00Z' },
    isAuthenticated: true,
    accessToken: 'test-token',
  } as never)
  registerScenario(probe)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete SCENARIOS['first-game']
})

describe('TourHost', () => {
  it('renders nothing until a scenario is running', () => {
    renderHost()
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tour-pill')).not.toBeInTheDocument()
  })

  it('shows the bubble on the first step, pins its id, and advances once typing settles', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderHost()
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1' })
    })

    expect(await screen.findByTestId('tour-bubble-title')).toHaveTextContent('Next')
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('type-a-name'))

    await user.type(screen.getByTestId('probe-name'), 'Old mill')
    // Still on the first step: the input debounce has not elapsed.
    expect(useTourStore.getState().currentStepId).toBe('type-a-name')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INPUT_SETTLE_MS + 50)
    })

    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('read-this'))
    expect(useTourStore.getState().stepCompletedAt['type-a-name']).toBeGreaterThan(0)
  })

  it('collapses to the pill when the step anchor is not in the DOM', async () => {
    renderHost()
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1', stepId: 'read-this' })
    })

    expect(await screen.findByTestId('tour-pill')).toHaveTextContent('step 2 of 3')
    expect(screen.queryByTestId('tour-bubble')).not.toBeInTheDocument()
  })

  it('runs prepare when the step starts and again when the pill resumes', async () => {
    const user = userEvent.setup()
    renderHost()
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1', stepId: 'read-this' })
    })

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1))

    act(() => {
      useTourStore.getState().pause()
    })
    await user.click(await screen.findByTestId('tour-pill-resume'))

    expect(useTourStore.getState().paused).toBe(false)
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('navigates back to the bound game before resuming a workspace step', async () => {
    const user = userEvent.setup()
    renderHost('/dashboard')
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1', stepId: 'read-this' })
    })

    await user.click(await screen.findByTestId('tour-pill-resume'))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/game/game-1'))
  })

  it('pauses when the bubble is closed and shows the pill instead', async () => {
    const user = userEvent.setup()
    renderHost()
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1' })
    })

    await user.click(await screen.findByTestId('tour-close'))

    expect(useTourStore.getState().paused).toBe(true)
    expect(await screen.findByTestId('tour-pill')).toBeInTheDocument()
  })

  it('does not bind a route game for a setup-game scenario', async () => {
    renderHost()
    act(() => {
      useTourStore.getState().start('first-game')
    })

    await waitFor(() => expect(screen.getByTestId('tour-bubble')).toBeInTheDocument())
    expect(useTourStore.getState().gameId).toBeNull()
  })

  it('moves on when the current step drops out of the effective list', async () => {
    renderHost()
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1' })
      useTourStore.getState().later('flag')
      useTourStore.getState().setCurrentStep('only-when-flagged')
    })
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('only-when-flagged'))

    // The guard turns false: a new run without the flag, positioned on the guarded step.
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1', stepId: 'only-when-flagged' })
    })

    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('finish'))
  })

  it('renders the anchorless closing step centred and completes the run on Got it', async () => {
    const user = userEvent.setup()
    renderHost()
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1', stepId: 'finish' })
    })

    expect(await screen.findByTestId('tour-bubble')).toBeInTheDocument()
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tour-pill')).not.toBeInTheDocument()
    expect(screen.getByTestId('tour-next')).toHaveTextContent('Got it')

    await user.click(screen.getByTestId('tour-next'))

    await waitFor(() => expect(useTourStore.getState().activeScenario).toBeNull())
    expect(useTourStore.getState().progress['first-game']?.status).toBe('completed')
    expect(useTourStore.getState().progress['first-game']?.gameId).toBe('game-1')
  })
})

describe('TourHost new-game binding', () => {
  const newGame: Scenario = { ...probe, entry: 'new-game' }

  beforeEach(() => {
    registerScenario(newGame)
  })

  it('binds the game the operator just created', async () => {
    renderHost('/game/g-new')
    act(() => {
      useTourStore.getState().start('first-game', { gamesAtStart: ['g-old'] })
    })
    await waitFor(() => expect(useTourStore.getState().gameId).toBe('g-new'))
  })

  it('never binds a game that already existed when the run started', async () => {
    renderHost('/game/g-old')
    act(() => {
      useTourStore.getState().start('first-game', { gamesAtStart: ['g-old'] })
    })
    await waitFor(() => expect(screen.getByTestId('tour-bubble')).toBeInTheDocument())
    expect(useTourStore.getState().gameId).toBeNull()
  })
})
