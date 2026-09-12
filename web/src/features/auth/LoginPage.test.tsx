import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
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
beforeEach(() => {
  store.clear()
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, hasHydrated: true })
  server.use(http.post('/api/auth/login', () => HttpResponse.json({ accessToken, user: { id: 'user-1', email: 'test@example.com', name: 'Test Operator', role: 'operator', createdAt: '2026-01-01T00:00:00Z' } })))
})
afterEach(() => useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null }))

describe('LoginPage', () => {
  it('refuses a participant account and explains where to play', async () => {
    // The backend issues tokens (the player app needs them); the operator surface sends the account away.
    server.use(http.post('/api/auth/login', () => HttpResponse.json({ accessToken, user: { id: 'user-2', email: 'ana@example.com', name: 'Ana', role: 'participant', createdAt: '2026-01-01T00:00:00Z' } })))
    mount()
    await signIn()
    expect(await screen.findByText(/This is a player account/)).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('lands on the dashboard after signing in, never bouncing through the guard first', async () => {
    mount()
    await signIn()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'))
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
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
