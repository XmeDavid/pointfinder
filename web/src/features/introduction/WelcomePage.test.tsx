import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { createMockGame } from '@/test/factories/game'
import { useAuthStore } from '@/lib/auth/store'
import { useTourStore } from '@/features/tutorials/store'
import { WelcomePage } from './WelcomePage'
import { INTRODUCTION_HANDOFF_KEY } from './progress'

const store = vi.hoisted(() => new Map<string, string>())
const auth = vi.hoisted(() => ({ kind: 'anonymous' as string }))
vi.mock('@/platform', () => ({
  kv: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    remove: vi.fn(async (key: string) => { store.delete(key) }),
  },
}))
vi.mock('@/app/player/services', () => ({ useAuth: () => auth }))

const OPERATOR = { id: 'user-1', email: 'test@example.com', name: 'Test Operator', role: 'operator' as const, createdAt: '2026-01-01T00:00:00.000Z' }
const accessToken = `header.${btoa(JSON.stringify({ exp: 4102444800 })).replace(/=+$/, '')}.signature`
let games: ReturnType<typeof createMockGame>[] = []

function Location() { return <span data-testid="location">{`${useLocation().pathname}${useLocation().search}`}</span> }
function mount(path = '/welcome') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="*" element={null} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const experience = () => screen.getByTestId('onboarding-experience')
const location = () => screen.getByTestId('location')
const finishChapters = () => { for (let i = 0; i < (experience().getAttribute('data-role') === 'organizer' ? 3 : 4); i++) fireEvent.click(screen.getByTestId('onboarding-next')) }
const introductionPuts = () => tutorialProgressStore.puts().filter((put) => put.scenarioId === 'introduction').map((put) => put.body.status)
const row = (scenarioId: string, status: 'in_progress' | 'completed' | 'skipped') =>
  ({ scenarioId: scenarioId as never, status, currentStep: null, gameId: null, startedAt: '2026-09-08T09:00:00.000Z', completedAt: null })

beforeEach(() => {
  store.clear()
  auth.kind = 'anonymous'
  games = []
  tutorialProgressStore.reset()
  useTourStore.getState().reset()
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, hasHydrated: true })
  server.use(http.get('/api/games', () => HttpResponse.json(games)))
})
afterEach(() => useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null }))

function signInOperator() {
  useAuthStore.setState({ user: OPERATOR, isAuthenticated: true, accessToken, hasHydrated: true, sessionVersion: useAuthStore.getState().sessionVersion + 1 })
}

describe('visitors', () => {
  it('shows the role choice, and hands an organizer story on to the next account', async () => {
    mount()
    expect(experience()).toHaveAttribute('data-mode', 'anonymous')
    expect(experience()).toHaveAttribute('data-step', 'choice')
    fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
    fireEvent.click(screen.getByTestId('onboarding-gate-watch'))
    finishChapters()
    expect(experience()).toHaveAttribute('data-step', 'compass')
    await waitFor(() => expect(store.get(INTRODUCTION_HANDOFF_KEY)).toContain('"completed"'))
    expect(introductionPuts()).toEqual([])
  })

  it('does not hand a participant story on to anyone', async () => {
    mount('/welcome?play=participant')
    expect(experience()).toHaveAttribute('data-step', 'join')
    finishChapters()
    await waitFor(() => expect(experience()).toHaveAttribute('data-step', 'compass'))
    expect(store.has(INTRODUCTION_HANDOFF_KEY)).toBe(false)
  })

  it('opens the organizer gate for pricing links', () => {
    mount('/welcome?role=organizer')
    expect(experience()).toHaveAttribute('data-step', 'gate')
    expect(screen.getByTestId('onboarding-gate-create-account')).toBeInTheDocument()
  })

  it('waits for the session to be known before choosing a story', () => {
    useAuthStore.setState({ hasHydrated: false })
    mount()
    expect(screen.queryByTestId('onboarding-experience')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('players', () => {
  it('shows the participant story with the game one tap away', () => {
    auth.kind = 'player'
    mount()
    expect(experience()).toHaveAttribute('data-mode', 'player')
    expect(experience()).toHaveAttribute('data-step', 'join')
    expect(screen.getByTestId('onboarding-player-back')).toHaveAttribute('href', '/')
  })
})

describe('operators', () => {
  beforeEach(signInOperator)

  it('offers the tour; declining records a skip and leaves for the dashboard', async () => {
    mount()
    expect(experience()).toHaveAttribute('data-mode', 'operator')
    expect(experience()).toHaveAttribute('data-step', 'gate')
    fireEvent.click(screen.getByTestId('onboarding-tour-skip'))
    expect(location()).toHaveTextContent('/dashboard')
    await waitFor(() => expect(introductionPuts()).toEqual(['skipped']))
  })

  it('does not downgrade a watched introduction when the gate is declined again', async () => {
    tutorialProgressStore.seed([row('introduction', 'completed')])
    mount()
    await waitFor(() => expect(tutorialProgressStore.rows()).toHaveLength(1))
    // The row is in the cache once the query settles.
    await new Promise((resolve) => setTimeout(resolve, 20))
    fireEvent.click(screen.getByTestId('onboarding-tour-skip'))
    expect(location()).toHaveTextContent('/dashboard')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(introductionPuts()).toEqual([])
  })

  it('plays the story after registration and hands off to the guided first game exactly once', async () => {
    mount('/welcome?play=organizer')
    expect(experience()).toHaveAttribute('data-step', 'plan')
    finishChapters()
    expect(experience()).toHaveAttribute('data-step', 'compass')
    await waitFor(() => expect(introductionPuts()).toEqual(['completed']))
    // Empty dashboard, no first-game row: the landing leads with the first game.
    const start = await screen.findByTestId('onboarding-first-game')
    expect(useTourStore.getState().activeScenario).toBeNull()
    fireEvent.click(start)
    expect(useTourStore.getState().activeScenario).toBe('first-game')
    expect(useTourStore.getState().gamesAtStart).toEqual([])
    expect(location()).toHaveTextContent('/dashboard')
    // Nothing was created: the tutorial's first lesson is the create dialog.
    expect(tutorialProgressStore.practiceGames()).toEqual([])
  })

  it('leads only to the dashboard once the first game has been started, done or skipped', async () => {
    tutorialProgressStore.seed([row('first-game', 'skipped')])
    mount('/welcome?play=organizer')
    finishChapters()
    await waitFor(() => expect(introductionPuts()).toEqual(['completed']))
    await waitFor(() => expect(screen.getByTestId('onboarding-dashboard')).toBeInTheDocument())
    expect(screen.queryByTestId('onboarding-first-game')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('onboarding-dashboard'))
    expect(location()).toHaveTextContent('/dashboard')
    expect(useTourStore.getState().activeScenario).toBeNull()
  })

  it('leads only to the dashboard when the operator already has games', async () => {
    games = [createMockGame({ id: 'g1' })]
    mount('/welcome?play=organizer')
    finishChapters()
    await waitFor(() => expect(introductionPuts()).toEqual(['completed']))
    await waitFor(() => expect(screen.getByTestId('onboarding-dashboard')).toBeInTheDocument())
    expect(screen.queryByTestId('onboarding-first-game')).not.toBeInTheDocument()
  })

  it('records a skip mid-story, but never over a completed introduction on replay', async () => {
    mount('/welcome?play=organizer')
    fireEvent.click(screen.getByTestId('onboarding-next'))
    fireEvent.click(screen.getByTestId('onboarding-skip'))
    await waitFor(() => expect(introductionPuts()).toEqual(['skipped']))

    tutorialProgressStore.reset()
    tutorialProgressStore.seed([row('introduction', 'completed')])
    const replay = mount('/welcome?play=organizer')
    await new Promise((resolve) => setTimeout(resolve, 20))
    fireEvent.click(replay.container.querySelector('[data-testid="onboarding-skip"]')!)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(introductionPuts()).toEqual([])
  })

  it('keeps the story usable when progress cannot be written', async () => {
    server.use(http.put('/api/users/me/tutorials/introduction', () => HttpResponse.error()))
    mount('/welcome?play=organizer')
    finishChapters()
    expect(experience()).toHaveAttribute('data-step', 'compass')
    await waitFor(() => expect(store.get('introduction.account.user-1.v1')).toContain('"pending":true'))
    expect(screen.getByTestId('onboarding-dashboard')).toBeInTheDocument()
  })
})
