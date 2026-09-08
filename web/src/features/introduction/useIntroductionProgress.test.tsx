import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { useAuthStore } from '@/lib/auth/store'
import { useTutorialProgress } from '@/hooks/queries/useTutorialProgress'
import { useIntroductionProgress } from './useIntroductionProgress'

const accessToken = `header.${btoa(JSON.stringify({ exp: 4102444800 })).replace(/=+$/, '')}.signature`
const rows = [
  { scenarioId: 'introduction', status: 'completed', currentStep: null, gameId: null, startedAt: '2026-09-08T09:00:00.000Z', completedAt: '2026-09-08T09:01:00.000Z' },
  { scenarioId: 'first-game', status: 'in_progress', currentStep: 'orient', gameId: null, startedAt: '2026-09-08T09:02:00.000Z', completedAt: null },
  { scenarioId: 'some-future-scenario', status: 'skipped', currentStep: null, gameId: null, startedAt: '2026-09-08T09:03:00.000Z', completedAt: null },
]

let requests = 0

beforeEach(() => {
  requests = 0
  useAuthStore.setState({ user: { id: 'user-1', email: 'test@example.com', name: 'Test Operator', role: 'operator', createdAt: '2026-01-01T00:00:00.000Z' }, isAuthenticated: true, accessToken, hasHydrated: true })
  server.use(http.get('/api/users/me/tutorials', () => { requests += 1; return HttpResponse.json(rows) }))
})
afterEach(() => useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null }))

describe('account progress rows', () => {
  it('share one request: the engine sees only its scenarios, the introduction sees only its own row', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => ({ tutorials: useTutorialProgress(), introduction: useIntroductionProgress() }), { wrapper })
    await waitFor(() => expect(result.current.tutorials.isSuccess && result.current.introduction.isSuccess).toBe(true))
    expect(requests).toBe(1)
    expect(result.current.tutorials.data?.map((row) => row.scenarioId)).toEqual(['first-game'])
    expect(result.current.introduction.data?.status).toBe('completed')
  })

  it('reports no introduction row as null rather than an error', async () => {
    server.use(http.get('/api/users/me/tutorials', () => HttpResponse.json([])))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useIntroductionProgress(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})
