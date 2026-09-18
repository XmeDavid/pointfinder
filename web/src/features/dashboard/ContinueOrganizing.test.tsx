import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { accountAuth, renderPlayer } from '@/features/player/test/renderPlayer'
import { useAuthStore } from '@/lib/auth/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'
const history = vi.hoisted(() => vi.fn())
vi.mock('./organizingRecency', async importOriginal => ({
  ...await importOriginal<typeof import('./organizingRecency')>(), recentOrganizedGames: history,
}))
import { ContinueOrganizing } from './ContinueOrganizing'

const account = { ...accountAuth, role: 'operator' as const, userId: 'u-op', userName: 'Organizer' }
const user = { id: 'u-op', name: 'Organizer', email: 'op@example.test', role: 'operator' as const, createdAt: '' }
const game = { id: 'g', name: 'Remembered trail', status: 'setup', orgId: null }
const operatorToken = `header.${btoa(JSON.stringify({ sub: user.id, exp: 4102444800 }))}.signature`
function Location() { return <p data-testid="location">{useLocation().pathname}</p> }

beforeEach(() => {
  history.mockReset().mockResolvedValue(['g'])
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, hasHydrated: true })
  useWorkspaceContext.setState({ active: { type: 'personal' } })
})
afterEach(() => useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null }))

describe('Home organizer continuation', () => {
  it('validates the game with the account bearer, then exchanges sessions only on open', async () => {
    let bearer: string | null = null
    let exchanges = 0
    server.use(
      http.get('/api/games/g', ({ request }) => {
        bearer = request.headers.get('authorization')
        return HttpResponse.json(game)
      }),
      http.post('/api/account/organizer-session', () => {
        exchanges++
        return HttpResponse.json({ user, accessToken: operatorToken, refreshToken: 'operator-refresh' })
      }),
    )
    await renderPlayer(<><ContinueOrganizing /><Location /></>, { auth: null, account, route: '/dashboard' })
    expect(await screen.findByRole('heading', { name: game.name })).toBeInTheDocument()
    expect(bearer).toBe(`Bearer ${account.accessToken}`)
    expect(exchanges).toBe(0)
    await userEvent.click(screen.getByTestId('continue-organizing-btn'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/game/g'))
    expect(exchanges).toBe(1)
    expect(useAuthStore.getState().accessToken).toBe(operatorToken)
  })

  it('never reveals a response that arrives after account sign-out', async () => {
    let release!: () => void
    server.use(http.get('/api/games/g', async () => {
      await new Promise<void>(resolve => { release = resolve })
      return HttpResponse.json(game)
    }))
    const { services } = await renderPlayer(<ContinueOrganizing />, { auth: null, account })
    await waitFor(() => expect(release).toBeDefined())
    await act(async () => services.account.session.logout())
    await act(async () => { release() })
    expect(screen.queryByRole('heading', { name: game.name })).not.toBeInTheDocument()
    expect(screen.queryByTestId('continue-organizing-btn')).not.toBeInTheDocument()
  })

  it('offers retry for unavailable history and recovers without changing sessions', async () => {
    history.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue(['g'])
    server.use(http.get('/api/games/g', () => HttpResponse.json(game)))
    await renderPlayer(<ContinueOrganizing />, { auth: null, account })
    expect(await screen.findByTestId('continue-organizing-error')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }))
    expect(await screen.findByRole('heading', { name: game.name })).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('does not look up operator history for a participant', async () => {
    await renderPlayer(<ContinueOrganizing />, { auth: null, account: accountAuth })
    expect(history).not.toHaveBeenCalled()
    expect(screen.queryByTestId('continue-organizing')).not.toBeInTheDocument()
  })
})
