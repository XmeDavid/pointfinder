import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { accountAuth, renderPlayer } from '@/features/player/test/renderPlayer'
import { useAuthStore } from '@/lib/auth/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { StrictMode } from 'react'
import { OrganizerSessionBridge } from './OrganizerSessionBridge'

/**
 * OW-01: an organizer who signed in through the player entry has an account
 * session only. Organize must still open, through a role-checked exchange on
 * the server, and a participant must never get there.
 */
const organizerAccount = { ...accountAuth, role: 'operator' as const, userId: 'u-op', userName: 'Op', email: 'op@example.com' }

const exchanged = {
  accessToken: 'exchanged-access',
  refreshToken: 'exchanged-refresh',
  user: { id: 'u-op', email: 'op@example.com', name: 'Op', role: 'operator', createdAt: '2026-01-01T00:00:00Z' },
}

describe('OrganizerSessionBridge', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null, hasHydrated: true })
    useWorkspaceContext.setState({ active: { type: 'personal' } })
  })
  afterEach(() => useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null }))

  it('offers Organize to an operator account and exchanges it for an operator session', async () => {
    let bearer: string | null = null
    server.use(
      http.post('/api/account/organizer-session', ({ request }) => {
        bearer = request.headers.get('authorization')
        return HttpResponse.json(exchanged)
      }),
    )
    await renderPlayer(<OrganizerSessionBridge />, { auth: null, route: '/dashboard?view=organize', account: organizerAccount })
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
    expect(bearer).toBe(`Bearer ${organizerAccount.accessToken}`)
    const operator = useAuthStore.getState()
    expect(operator.isAuthenticated).toBe(true)
    expect(operator.user?.id).toBe('u-op')
    // The operator store holds the exchanged pair, never the account's tokens.
    expect(operator.accessToken).toBe('exchanged-access')
    expect(operator.accessToken).not.toBe(organizerAccount.accessToken)
  })

  it('shows the denial when the server refuses the role, without promoting the account', async () => {
    server.use(http.post('/api/account/organizer-session', () => HttpResponse.json({ message: 'Organizer role required', code: 'ORGANIZER_ROLE_REQUIRED' }, { status: 403 })))
    await renderPlayer(<OrganizerSessionBridge />, { auth: null, route: '/dashboard?view=organize', account: organizerAccount })
    expect(await screen.findByTestId('organizer-session-denied')).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('shows an error with retry when the exchange fails, then recovers', async () => {
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.post('/api/account/organizer-session', () => {
        attempts += 1
        return attempts === 1 ? HttpResponse.json({ message: 'down' }, { status: 500 }) : HttpResponse.json(exchanged)
      }),
    )
    await renderPlayer(<StrictMode><OrganizerSessionBridge /></StrictMode>, { auth: null, route: '/dashboard?view=organize', account: organizerAccount })
    expect(await screen.findByTestId('organizer-session-error')).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    await user.click(screen.getByRole('button', { name: /Retry|Try again/ }))
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
    await waitFor(() => expect(useAuthStore.getState().user?.id).toBe('u-op'))
    expect(attempts).toBe(2)
  })
  it('ignores an exchange completed after account sign-out', async () => {
    let release!: () => void
    let started = false
    server.use(http.post('/api/account/organizer-session', async () => {
      started = true
      await new Promise<void>(resolve => { release = resolve })
      return HttpResponse.json(exchanged)
    }))
    const { services } = await renderPlayer(<OrganizerSessionBridge />, { auth: null, account: organizerAccount })
    await waitFor(() => expect(started).toBe(true))
    await act(async () => { await services.account.session.logout() })
    await act(async () => { release() })
    expect(await screen.findByTestId('organizer-session-error')).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

})
