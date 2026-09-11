import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { accountAuth, renderPlayer } from '@/features/player/test/renderPlayer'
import { useAuthStore } from '@/lib/auth/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { DashboardPage } from './DashboardPage'

/**
 * The unified home serves three people: a visitor with no session, a player
 * mid-game, and an operator. Each must land on something useful without the
 * others' data leaking in.
 */
describe('DashboardPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, hasHydrated: true })
    useWorkspaceContext.setState({ active: { type: 'personal' } })
  })
  afterEach(() => useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null }))

  it('welcomes a visitor with discovery and a way to join, without an organize entry', async () => {
    await renderPlayer(<DashboardPage />, { auth: null, route: '/dashboard' })
    expect(await screen.findByTestId('user-experience')).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' }).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('link', { name: /Organize/ })).toHaveLength(0)
    expect(screen.getByText('Join with a code')).toBeInTheDocument()
  })

  it('shows a player their current game and a way back to the map', async () => {
    await renderPlayer(<DashboardPage />, { route: '/dashboard' })
    expect(await screen.findByText('Serra da Estrela')).toBeInTheDocument()
    expect(screen.getByText('Continue playing')).toBeInTheDocument()
  })

  it('lists a signed-in account\'s published games from Explore, offline-safe', async () => {
    await renderPlayer(<DashboardPage />, { auth: null, route: '/dashboard', account: accountAuth })
    expect((await screen.findAllByText('Coastal trail')).length).toBeGreaterThan(0)
  })

  it('shows the explore error state with a retry when the listing fails', async () => {
    server.use(http.get('/api/explore/games', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    await renderPlayer(<DashboardPage />, { auth: null, route: '/dashboard', account: accountAuth })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry|Try again/ })).toBeInTheDocument()
  })

  it('gives an operator the Organize view with their games and a create button', async () => {
    useAuthStore.setState({ user: { id: 'user-1', email: 'op@example.com', name: 'Op', role: 'operator', createdAt: '2026-01-01T00:00:00Z' }, isAuthenticated: true, accessToken: 'tok', hasHydrated: true })
    await renderPlayer(<DashboardPage />, { auth: null, route: '/dashboard?view=organize' })
    expect(await screen.findByTestId('create-game-btn')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Test Game 1')).toBeInTheDocument())
    expect(screen.getAllByRole('link', { name: /Organize/ }).length).toBeGreaterThan(0)
  })

  it('hides Organize from a participant account', async () => {
    useAuthStore.setState({ user: { id: 'user-2', email: 'ana@example.com', name: 'Ana', role: 'participant', createdAt: '2026-01-01T00:00:00Z' }, isAuthenticated: true, accessToken: 'tok', hasHydrated: true })
    await renderPlayer(<DashboardPage />, { auth: null, route: '/dashboard', account: accountAuth })
    await screen.findByTestId('user-experience')
    expect(screen.queryAllByRole('link', { name: /Organize/ })).toHaveLength(0)
  })
})
