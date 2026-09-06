import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { useAuthStore } from '@/lib/auth/store'
import { useTourStore } from './store'
import {
  PROGRESS_WRITE_DEBOUNCE_MS,
  resetProgressSync,
  useProgressHydration,
  useProgressWriteThrough,
} from './progressSync'
import type { TutorialProgress } from './types'

const OPERATOR = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test Operator',
  role: 'operator' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function row(overrides: Partial<TutorialProgress> = {}): TutorialProgress {
  return {
    scenarioId: 'first-game',
    status: 'in_progress',
    currentStep: 'orient',
    gameId: null,
    startedAt: '2026-09-06T09:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

function Harness() {
  useProgressHydration()
  useProgressWriteThrough()
  return null
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
}

const settle = () => vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS + 50)

describe('tutorial progress sync', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    tutorialProgressStore.reset()
    resetProgressSync()
    useTourStore.getState().reset()
    useAuthStore.setState({ user: OPERATOR, isAuthenticated: true, accessToken: 'token' } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null } as never)
  })

  it('hydrates the store progress map from the server', async () => {
    tutorialProgressStore.seed([row({ status: 'completed', completedAt: '2026-09-06T10:00:00.000Z' })])

    renderHarness()

    await waitFor(() => {
      expect(useTourStore.getState().progress['first-game']?.status).toBe('completed')
    })
  })

  it('never echoes a hydrated row back to the server', async () => {
    tutorialProgressStore.seed([row()])

    renderHarness()

    await waitFor(() => expect(useTourStore.getState().progress['first-game']).toBeDefined())
    await settle()

    expect(tutorialProgressStore.puts()).toEqual([])
  })

  it('debounces a run of step changes into a single write carrying the live step', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('first-game')
    useTourStore.getState().setCurrentStep('orient')
    useTourStore.getState().setCurrentStep('place-base')
    await vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS - 50)
    expect(tutorialProgressStore.puts()).toEqual([])

    await vi.advanceTimersByTimeAsync(100)
    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(tutorialProgressStore.puts()[0]).toEqual({
      scenarioId: 'first-game',
      body: { status: 'in_progress', currentStep: 'place-base', gameId: null },
    })

    view.unmount()
  })

  it('flushes the pending write on unmount', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('first-game', { stepId: 'go-live' })
    view.unmount()

    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(tutorialProgressStore.puts()[0].body.currentStep).toBe('go-live')
  })

  it('writes completed when the run completes', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('first-game', { stepId: 'finish' })
    useTourStore.getState().complete()

    await settle()
    await waitFor(() => expect(tutorialProgressStore.rows()).toHaveLength(1))
    expect(tutorialProgressStore.rows()[0].status).toBe('completed')

    view.unmount()
  })

  it('writes skipped when the welcome card skips the scenario', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().skip('first-game')

    await settle()
    await waitFor(() => expect(tutorialProgressStore.rows()).toHaveLength(1))
    expect(tutorialProgressStore.rows()[0].status).toBe('skipped')

    view.unmount()
  })

  it('carries the bound game id for a setup-game run', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('fixed-route', { gameId: 'game-9', stepId: 'arrange' })

    await settle()
    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(tutorialProgressStore.puts()[0].body.gameId).toBe('game-9')

    view.unmount()
  })

  it('writes nothing while the visitor is not an operator', async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null } as never)
    const view = renderHarness()

    useTourStore.getState().start('first-game')
    await settle()

    expect(tutorialProgressStore.puts()).toEqual([])
    view.unmount()
  })

  it('retries a failed write on the next change instead of treating it as synced', async () => {
    let failures = 0
    server.use(
      http.put('/api/users/me/tutorials/:scenarioId', () => {
        failures += 1
        return HttpResponse.json({ message: 'down' }, { status: 503 })
      }, { once: true }),
    )
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('first-game', { stepId: 'orient' })
    await settle()
    await waitFor(() => expect(failures).toBe(1))
    expect(tutorialProgressStore.rows()).toEqual([])

    useTourStore.getState().setCurrentStep('place-base')
    await settle()
    await waitFor(() => expect(tutorialProgressStore.rows()).toHaveLength(1))
    expect(tutorialProgressStore.rows()[0].currentStep).toBe('place-base')

    view.unmount()
  })

  it('flushes on logout and resets the tour store', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('first-game', { stepId: 'go-live' })
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null } as never)

    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(useTourStore.getState().activeScenario).toBeNull()

    view.unmount()
  })
})
