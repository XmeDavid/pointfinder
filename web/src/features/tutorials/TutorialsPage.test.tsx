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

  it('ignores the retired account introduction row instead of rendering it as a card', async () => {
    tutorialProgressStore.seed([
      { scenarioId: 'introduction' as never, status: 'completed', currentStep: null, gameId: null, startedAt: '2026-09-06T09:00:00.000Z', completedAt: '2026-09-06T09:01:00.000Z' },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-status-first-game')).toHaveTextContent('Not started'))
    expect(screen.queryByTestId('tutorial-card-introduction')).not.toBeInTheDocument()
    expect(screen.queryByText('How PointFinder works')).not.toBeInTheDocument()
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

  it('Start on a practice-game scenario creates a seeded practice game and walks into it', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-start-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-start-fixed-route'))

    await waitFor(() => expect(tutorialProgressStore.practiceGames()).toHaveLength(1))
    expect(tutorialProgressStore.practiceGames()[0]).toMatchObject({ name: 'Practice: fixed route', tutorialScenario: 'fixed-route' })
    await waitFor(() => expect(useTourStore.getState().activeScenario).toBe('fixed-route'))
    expect(useTourStore.getState().gameId).toBe('practice-fixed-route')
    expect(useTourStore.getState().currentStepId).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith('/game/practice-fixed-route')
  })

  it('Resume walks straight back into the bound practice game while it is still there', async () => {
    server.use(http.get('/api/games', () => HttpResponse.json([
      { ...createMockGame({ id: 'practice-1', status: 'setup' }), tutorialScenario: 'fixed-route', tutorialExpiresAt: '2026-09-08T09:00:00Z' },
    ])))
    tutorialProgressStore.seed([
      { scenarioId: 'fixed-route', status: 'in_progress', currentStep: 'arrange', gameId: 'practice-1', startedAt: '2026-09-06T09:00:00.000Z', completedAt: null },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-resume-fixed-route')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('tutorial-card-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-resume-fixed-route'))

    await waitFor(() => expect(useTourStore.getState().gameId).toBe('practice-1'))
    expect(useTourStore.getState().currentStepId).toBe('arrange')
    expect(mockNavigate).toHaveBeenCalledWith('/game/practice-1')
    expect(tutorialProgressStore.practiceGames()).toHaveLength(0)
  })

  it('replaces an existing practice game without asking: deletes it and creates the new one', async () => {
    const deleted: string[] = []
    server.use(
      http.get('/api/games', () => HttpResponse.json([
        { ...createMockGame({ id: 'practice-old', name: 'Old practice', status: 'setup' }), tutorialScenario: 'fixed-route', tutorialExpiresAt: '2026-09-08T09:00:00Z' },
      ])),
      http.delete('/api/games/:id', ({ params }) => {
        deleted.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-start-exploration')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('tutorial-card-exploration')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-start-exploration'))

    await waitFor(() => expect(deleted).toEqual(['practice-old']))
    await waitFor(() => expect(tutorialProgressStore.practiceGames()).toHaveLength(1))
    expect(tutorialProgressStore.practiceGames()[0].tutorialScenario).toBe('exploration')
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/game/practice-exploration'))
  })

  it('a bound practice game that has ended is not resumed into', async () => {
    server.use(http.get('/api/games', () => HttpResponse.json([
      { ...createMockGame({ id: 'practice-done', status: 'ended' }), tutorialScenario: 'fixed-route', tutorialExpiresAt: '2026-09-05T09:00:00Z' },
    ])))
    tutorialProgressStore.seed([
      { scenarioId: 'fixed-route', status: 'in_progress', currentStep: 'arrange', gameId: 'practice-done', startedAt: '2026-09-06T09:00:00.000Z', completedAt: null },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-resume-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-resume-fixed-route'))

    await waitFor(() => expect(tutorialProgressStore.practiceGames()).toHaveLength(1))
    expect(useTourStore.getState().gameId).toBe('practice-fixed-route')
    expect(useTourStore.getState().currentStepId).toBeNull()
  })

  it('replaces the practice game the server knows about when the list was stale', async () => {
    let listCalls = 0
    let createCalls = 0
    const deleted: string[] = []
    server.use(
      http.get('/api/games', () => {
        listCalls += 1
        // First load: nothing. After the 409, the refetch reveals the practice game made elsewhere.
        return HttpResponse.json(listCalls === 1 ? [] : [
          { ...createMockGame({ id: 'practice-elsewhere', name: 'Made on the phone', status: 'setup' }), tutorialScenario: 'fixed-route', tutorialExpiresAt: '2026-09-08T09:00:00Z' },
        ])
      }),
      http.post('/api/users/me/tutorials/:scenarioId/practice-game', async ({ params, request }) => {
        createCalls += 1
        if (createCalls === 1) {
          return HttpResponse.json({ status: 409, message: 'exists', code: 'TUTORIAL_PRACTICE_GAME_EXISTS' }, { status: 409 })
        }
        const body = (await request.json()) as { name: string }
        return HttpResponse.json(
          { ...createMockGame({ id: `practice-${String(params.scenarioId)}`, name: body.name, status: 'setup' }), tutorialScenario: String(params.scenarioId), tutorialExpiresAt: '2026-09-08T09:00:00Z' },
          { status: 201 },
        )
      }),
      http.delete('/api/games/:id', ({ params }) => {
        deleted.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-start-exploration')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-start-exploration'))

    await waitFor(() => expect(deleted).toEqual(['practice-elsewhere']))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/game/practice-exploration'))
    expect(createCalls).toBe(2)
    expect(screen.queryByTestId('tutorials-practice-error')).not.toBeInTheDocument()
  })

  it('shows a localized error when the practice game cannot be created', async () => {
    server.use(http.post('/api/users/me/tutorials/:scenarioId/practice-game', () =>
      HttpResponse.json({ status: 500, message: 'boom' }, { status: 500 }),
    ))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-start-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-start-fixed-route'))

    expect(await screen.findByTestId('tutorials-practice-error')).toBeInTheDocument()
    expect(useTourStore.getState().activeScenario).toBeNull()
  })

  it('shows the reason when the server refuses even after the stale game was replaced', async () => {
    server.use(
      http.get('/api/games', () => HttpResponse.json([
        { ...createMockGame({ id: 'practice-elsewhere', status: 'setup' }), tutorialScenario: 'fixed-route', tutorialExpiresAt: '2026-09-08T09:00:00Z' },
      ])),
      http.post('/api/users/me/tutorials/:scenarioId/practice-game', () =>
        HttpResponse.json({ status: 409, message: 'exists', code: 'TUTORIAL_PRACTICE_GAME_EXISTS' }, { status: 409 }),
      ),
      http.delete('/api/games/:id', () => new HttpResponse(null, { status: 204 })),
    )
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-start-exploration')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('tutorial-card-exploration')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-start-exploration'))

    expect(await screen.findByTestId('tutorials-practice-error')).toHaveTextContent('You already have a practice game. Delete or keep it first.')
  })
})
