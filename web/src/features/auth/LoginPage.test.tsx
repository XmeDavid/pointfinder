import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { useAuthStore } from '@/lib/auth/store'
import { GuestGuard } from '@/lib/auth/GuestGuard'
import { LoginPage } from './LoginPage'

const store = vi.hoisted(() => new Map<string, string>())
vi.mock('@/platform', () => ({
  kv: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    remove: vi.fn(async (key: string) => { store.delete(key) }),
  },
}))
vi.mock('@/app/player/services', () => ({ useAuth: () => ({ kind: 'anonymous' }) }))

const accessToken = `header.${btoa(JSON.stringify({ exp: 4102444800 })).replace(/=+$/, '')}.signature`

function Location() { return <span data-testid="location">{`${useLocation().pathname}${useLocation().search}`}</span> }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<GuestGuard><LoginPage /></GuestGuard>} />
          <Route path="*" element={null} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
async function signIn() {
  const user = userEvent.setup()
  await user.type(screen.getByTestId('login-email'), 'test@example.com')
  await user.type(screen.getByTestId('login-password'), 'secret-password')
  await user.click(screen.getByTestId('login-submit'))
}
const row = (status: 'in_progress' | 'completed' | 'skipped') =>
  ({ scenarioId: 'introduction' as never, status, currentStep: null, gameId: null, startedAt: '2026-09-08T09:00:00.000Z', completedAt: null })

beforeEach(() => {
  store.clear()
  tutorialProgressStore.reset()
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, hasHydrated: true })
  server.use(http.post('/api/auth/login', () => HttpResponse.json({ accessToken, user: { id: 'user-1', email: 'test@example.com', name: 'Test Operator', role: 'operator', createdAt: '2026-01-01T00:00:00Z' } })))
})
afterEach(() => useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null }))

describe('LoginPage', () => {
  it('goes to the dashboard as usual for an account that watched or skipped the introduction', async () => {
    tutorialProgressStore.seed([row('completed')])
    mount()
    await signIn()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'))
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('offers the introduction, without forcing it, to an account that never decided', async () => {
    mount()
    await signIn()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/welcome'))
    expect(screen.getByTestId('location')).not.toHaveTextContent('play=')
  })

  it('resumes an introduction that was started elsewhere, not every future sign-in', async () => {
    tutorialProgressStore.seed([row('in_progress')])
    mount()
    await signIn()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/welcome'))
  })

  it('carries an anonymous preview into the account and lands on the dashboard', async () => {
    store.set('introduction.handoff.v1', JSON.stringify({ status: 'completed', at: '2026-09-08T09:00:00.000Z' }))
    mount()
    await signIn()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'))
    expect(tutorialProgressStore.puts().map((put) => put.body.status)).toEqual(['completed'])
    expect(store.has('introduction.handoff.v1')).toBe(false)
  })

  it('lands on the dashboard when progress cannot be read, and never bounces through the guard first', async () => {
    server.use(http.get('/api/users/me/tutorials', () => HttpResponse.error()))
    mount()
    await signIn()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'))
  })

  it('keeps the form and its error on a failed sign-in', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 })))
    mount()
    await signIn()
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(screen.getByTestId('login-submit')).toBeEnabled()
  })
})
