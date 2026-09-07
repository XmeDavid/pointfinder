import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { createMockGame } from '@/test/factories/game'
import { useTourStore } from './store'
import { TutorialsPage } from './TutorialsPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TutorialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TutorialsPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    tutorialProgressStore.reset()
    useTourStore.getState().reset()
  })

  it('shows a skeleton while progress loads', () => {
    renderPage()
    expect(screen.getByTestId('tutorials-skeleton')).toBeInTheDocument()
  })

  it('shows an error with retry when progress cannot be loaded', async () => {
    server.use(http.get('/api/users/me/tutorials', () => HttpResponse.json({ message: 'boom' }, { status: 500 })))

    renderPage()

    await waitFor(() => expect(screen.getByTestId('tutorials-error')).toBeInTheDocument())
    expect(screen.getByTestId('tutorials-retry')).toBeInTheDocument()
  })

  it('renders one card per bundled scenario with a Not started badge', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('tutorial-card-first-game')).toBeInTheDocument())
    expect(screen.getByTestId('tutorial-card-fixed-route')).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-card-exploration')).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-status-first-game')).toHaveTextContent('Not started')
    expect(screen.getByTestId('tutorial-start-first-game')).toBeInTheDocument()
  })

  it('reflects each stored status on the badge', async () => {
    tutorialProgressStore.seed([
      { scenarioId: 'first-game', status: 'completed', currentStep: 'finish', gameId: null, startedAt: '2026-09-06T09:00:00.000Z', completedAt: '2026-09-06T09:40:00.000Z' },
      { scenarioId: 'fixed-route', status: 'skipped', currentStep: null, gameId: null, startedAt: '2026-09-06T09:00:00.000Z', completedAt: null },
    ])

    renderPage()

    await waitFor(() => expect(screen.getByTestId('tutorial-status-first-game')).toHaveTextContent('Completed'))
    expect(screen.getByTestId('tutorial-status-fixed-route')).toHaveTextContent('Skipped')
    expect(screen.getByTestId('tutorial-restart-first-game')).toBeInTheDocument()
  })

  it('Start on a new-game scenario starts the run and goes to the dashboard', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-start-first-game')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-start-first-game'))

    expect(useTourStore.getState().activeScenario).toBe('first-game')
    expect(useTourStore.getState().gamesAtStart).toEqual(['game-1', 'game-2'])
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('Resume starts at the stored step', async () => {
    tutorialProgressStore.seed([
      { scenarioId: 'first-game', status: 'in_progress', currentStep: 'go-live', gameId: null, startedAt: '2026-09-06T09:00:00.000Z', completedAt: null },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-resume-first-game')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-resume-first-game'))

    expect(useTourStore.getState().activeScenario).toBe('first-game')
    expect(useTourStore.getState().currentStepId).toBe('go-live')
  })

  it('Restart writes in_progress with a null step before starting from the top', async () => {
    tutorialProgressStore.seed([
      { scenarioId: 'first-game', status: 'completed', currentStep: 'finish', gameId: null, startedAt: '2026-09-06T09:00:00.000Z', completedAt: '2026-09-06T09:40:00.000Z' },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-restart-first-game')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-restart-first-game'))

    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(tutorialProgressStore.puts()[0]).toEqual({
      scenarioId: 'first-game',
      body: { status: 'in_progress', currentStep: null, gameId: null },
    })
    await waitFor(() => expect(useTourStore.getState().activeScenario).toBe('first-game'))
    expect(useTourStore.getState().currentStepId).toBeNull()
  })

  it('a setup-game scenario opens the picker when no game is bound', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-start-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-start-fixed-route'))

    await waitFor(() => expect(screen.getByTestId('setup-game-picker')).toBeInTheDocument())
    expect(useTourStore.getState().activeScenario).toBeNull()
  })

  it('a setup-game scenario resumes straight into its bound game when it is still in setup', async () => {
    server.use(http.get('/api/games', () => HttpResponse.json([createMockGame({ id: 'game-setup', status: 'setup' })])))
    tutorialProgressStore.seed([
      { scenarioId: 'fixed-route', status: 'in_progress', currentStep: 'arrange', gameId: 'game-setup', startedAt: '2026-09-06T09:00:00.000Z', completedAt: null },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-resume-fixed-route')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('tutorial-card-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-resume-fixed-route'))

    await waitFor(() => expect(useTourStore.getState().gameId).toBe('game-setup'))
    expect(useTourStore.getState().currentStepId).toBe('arrange')
    expect(mockNavigate).toHaveBeenCalledWith('/game/game-setup')
  })

  it('falls back to the picker when the bound game is no longer in setup', async () => {
    server.use(http.get('/api/games', () => HttpResponse.json([createMockGame({ id: 'game-setup', status: 'live' })])))
    tutorialProgressStore.seed([
      { scenarioId: 'fixed-route', status: 'in_progress', currentStep: 'arrange', gameId: 'game-setup', startedAt: '2026-09-06T09:00:00.000Z', completedAt: null },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-resume-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-resume-fixed-route'))

    await waitFor(() => expect(screen.getByTestId('setup-game-picker')).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
