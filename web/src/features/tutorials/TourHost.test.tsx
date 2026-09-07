import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
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
    // Only the debounce's own timer is faked: faking setInterval would stall
    // jsdom's requestAnimationFrame loop for the rest of the file.
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'Date'] })
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

describe('TourHost anchors that move or vanish', () => {
  it('still reads the DOM when the click unmounts the step anchor itself', async () => {
    const user = userEvent.setup()
    const scenario: Scenario = {
      ...probe,
      steps: [
        {
          id: 'open-editor',
          anchor: 'probe-open',
          done: { kind: 'predicate', test: (s) => s.field('probe-editor').present },
          copy: { title: 'tutorials.common.next', body: 'tutorials.common.gotIt' },
        },
        {
          id: 'after',
          anchor: 'probe-editor',
          done: { kind: 'ack' },
          copy: { title: 'tutorials.common.resume', body: 'tutorials.common.close' },
        },
      ],
    }
    registerScenario(scenario)

    function Editorish() {
      const [open, setOpen] = useState(false)
      return open ? (
        <section data-testid="probe-editor">editor</section>
      ) : (
        <button type="button" data-testid="probe-open" onClick={() => setOpen(true)}>
          open
        </button>
      )
    }
    render(
      <Harness path="/game/game-1">
        <Editorish />
        <TourHost />
      </Harness>,
    )
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1' })
    })
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('open-editor'))

    await user.click(screen.getByTestId('probe-open'))

    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('after'))
  })

  it('records the click on the same tick as the DOM it opened', async () => {
    const user = userEvent.setup()
    const scenario: Scenario = {
      ...probe,
      steps: [
        {
          id: 'print',
          anchor: 'probe-print',
          // Done once the sheet the click opens has been closed again.
          done: {
            kind: 'predicate',
            test: (s) => s.clickedSteps.has('print') && !s.field('probe-sheet').present,
          },
          copy: { title: 'tutorials.common.next', body: 'tutorials.common.gotIt' },
        },
        {
          id: 'after',
          anchor: 'probe-print',
          done: { kind: 'ack' },
          copy: { title: 'tutorials.common.resume', body: 'tutorials.common.close' },
        },
      ],
    }
    registerScenario(scenario)

    function Printish() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" data-testid="probe-print" onClick={() => setOpen(true)}>
            print
          </button>
          {open && (
            <section data-testid="probe-sheet">
              <button type="button" data-testid="probe-sheet-close" onClick={() => setOpen(false)}>
                close
              </button>
            </section>
          )}
        </>
      )
    }
    render(
      <Harness path="/game/game-1">
        <Printish />
        <TourHost />
      </Harness>,
    )
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1' })
    })
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('print'))

    await user.click(screen.getByTestId('probe-print'))
    await waitFor(() => expect(useTourStore.getState().clickedSteps.has('print')).toBe(true))
    // The sheet is open, so the step is still the current one.
    expect(useTourStore.getState().currentStepId).toBe('print')

    await user.click(screen.getByTestId('probe-sheet-close'))
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('after'))
  })

  it('advances on a state that already carries the completed step time', async () => {
    const scenario: Scenario = {
      ...probe,
      steps: [
        {
          id: 'first',
          anchor: 'probe-name',
          done: { kind: 'predicate', test: () => true },
          copy: { title: 'tutorials.common.next', body: 'tutorials.common.gotIt' },
        },
        {
          id: 'save-again',
          anchor: 'probe-name',
          // Satisfied only by a save that happened after "first" completed.
          done: {
            kind: 'predicate',
            test: (s) => (s.lastSuccess['probe:save'] ?? 0) > (s.stepCompletedAt['first'] ?? s.startedAt),
          },
          copy: { title: 'tutorials.common.resume', body: 'tutorials.common.close' },
        },
      ],
    }
    registerScenario(scenario)
    renderHost()
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1' })
      // A save from early in the run, long before "first" completes: it must
      // not count for "save-again" just because the guard read a stale clock.
      useTourStore.setState({ startedAt: 1_000 })
      useTourStore.getState().recordSuccess('probe:save', 2_000)
    })

    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('save-again'))
    expect(useTourStore.getState().activeScenario).toBe('first-game')
  })

  it('freezes the run while paused and picks the finished step up on resume', async () => {
    const user = userEvent.setup()
    renderHost()
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1' })
    })
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('type-a-name'))
    act(() => {
      useTourStore.getState().pause()
    })
    expect(screen.getByTestId('tour-pill')).toBeInTheDocument()

    await user.type(screen.getByTestId('probe-name'), 'Old mill')
    await new Promise((r) => setTimeout(r, INPUT_SETTLE_MS + 50))
    expect(useTourStore.getState().currentStepId).toBe('type-a-name')

    await user.click(screen.getByTestId('tour-pill-resume'))
    await waitFor(() => expect(useTourStore.getState().currentStepId).toBe('read-this'))
  })

  it('scrolls an off-screen anchor into view instead of collapsing to the pill', async () => {
    const offscreen = document.createElement('button')
    offscreen.setAttribute('data-testid', 'probe-missing')
    offscreen.getBoundingClientRect = () =>
      ({ top: 5000, left: 10, right: 210, bottom: 5040, width: 200, height: 40, x: 10, y: 5000, toJSON: () => ({}) }) as DOMRect
    const scrollIntoView = vi.fn(() => {
      offscreen.getBoundingClientRect = () =>
        ({ top: 100, left: 10, right: 210, bottom: 140, width: 200, height: 40, x: 10, y: 100, toJSON: () => ({}) }) as DOMRect
      window.dispatchEvent(new Event('scroll'))
    })
    offscreen.scrollIntoView = scrollIntoView as unknown as typeof offscreen.scrollIntoView
    document.body.appendChild(offscreen)

    renderHost()
    act(() => {
      useTourStore.getState().start('first-game', { gameId: 'game-1', stepId: 'read-this' })
    })

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('tour-bubble-title')).toHaveTextContent('Resume')
    expect(screen.queryByTestId('tour-pill')).not.toBeInTheDocument()
    offscreen.remove()
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
