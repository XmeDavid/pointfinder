import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from './store'
import { GuestGuard } from './GuestGuard'
import { holdPostAuthRedirect, releasePostAuthRedirect } from './postAuth'

const player = vi.hoisted(() => ({ kind: 'anonymous' as string }))
vi.mock('@/app/player/services', () => ({ useAuth: () => player }))

const OPERATOR = { id: 'user-1', email: 'test@example.com', name: 'Test Operator', role: 'operator' as const, createdAt: '2026-01-01T00:00:00.000Z' }

function Location() { return <span data-testid="location">{useLocation().pathname}</span> }
function mount() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<GuestGuard><div data-testid="page">login</div></GuestGuard>} />
        <Route path="*" element={null} />
      </Routes>
      <Location />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  player.kind = 'anonymous'
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, hasHydrated: true })
})
afterEach(() => {
  releasePostAuthRedirect()
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null })
})

describe('GuestGuard', () => {
  it('shows the page to a visitor', () => {
    mount()
    expect(screen.getByTestId('page')).toBeInTheDocument()
  })

  it('sends a signed-in operator to the dashboard', () => {
    useAuthStore.setState({ user: OPERATOR, isAuthenticated: true })
    mount()
    expect(screen.queryByTestId('page')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
  })

  it('keeps the page mounted while a sign-in on it is still choosing where to land', () => {
    holdPostAuthRedirect()
    useAuthStore.setState({ user: OPERATOR, isAuthenticated: true })
    mount()
    expect(screen.getByTestId('page')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('sends a joined player home', () => {
    player.kind = 'player'
    mount()
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })
})
