import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { useAuthStore } from '@/lib/auth/store'
import { GuestGuard } from '@/lib/auth/GuestGuard'
import { RegisterPage } from './RegisterPage'

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
const TOKEN = 'invite-token'

function Location() { return <span data-testid="location">{`${useLocation().pathname}${useLocation().search}`}</span> }
function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/register/:token?" element={<GuestGuard><RegisterPage /></GuestGuard>} />
          <Route path="*" element={null} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
async function completeRegistration() {
  const user = userEvent.setup()
  // The invite pins the email; the form only asks for the rest.
  await waitFor(() => expect(screen.getByLabelText(/Email/)).toHaveValue('new@example.com'))
  await user.type(screen.getByLabelText(/^Name/), 'New Operator')
  await user.type(screen.getByLabelText(/^Password/), 'secret-password')
  await user.type(screen.getByLabelText(/^Confirm Password/), 'secret-password')
  await user.click(screen.getByRole('button', { name: 'Create Account' }))
}
const registered = { accessToken, user: { id: 'user-new', email: 'new@example.com', name: 'New Operator', role: 'operator', createdAt: '2026-09-08T00:00:00Z' } }

beforeEach(() => {
  store.clear()
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, hasHydrated: true })
  server.use(
    http.get(`/api/auth/invite/${TOKEN}`, () => HttpResponse.json({ email: 'new@example.com' })),
    http.post(`/api/auth/register/${TOKEN}`, () => HttpResponse.json(registered)),
    http.post('/api/auth/request-registration', () => new HttpResponse(null, { status: 204 })),
  )
})
afterEach(() => useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null }))

describe('RegisterPage', () => {
  it('asks for an email first and confirms the link was sent', async () => {
    const user = userEvent.setup()
    mount('/register')
    await user.type(screen.getByLabelText(/Email/), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/register')
  })

  it('signs the new account in from the email link and lands on home', async () => {
    mount(`/register/${TOKEN}`)
    await completeRegistration()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'))
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.id).toBe('user-new')
  })

  it('keeps the form and its error when the invite is refused, without signing anyone in', async () => {
    server.use(http.post(`/api/auth/register/${TOKEN}`, () => HttpResponse.json({ message: 'Invite expired' }, { status: 400 })))
    mount(`/register/${TOKEN}`)
    await completeRegistration()
    expect(await screen.findByText('Invite expired')).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(screen.getByTestId('location')).toHaveTextContent(`/register/${TOKEN}`)
  })
})
