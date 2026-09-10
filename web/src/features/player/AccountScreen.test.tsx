import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { accountAuth, renderPlayer } from '@/features/player/test/renderPlayer'
import { playerFixtures } from '@/test/msw/handlers/player'
import AccountScreen from './AccountScreen'

describe('AccountScreen', () => {
  it('saves the current participation to the signed-in account by session token, without changing the player session', async () => {
    const linkBody = vi.fn()
    server.use(http.post('/api/player/account/link', async ({ request }) => {
      linkBody(await request.json())
      return HttpResponse.json({ linked: true, email: 'ana@example.com', name: 'Ana', emailVerified: false })
    }))
    const { services } = await renderPlayer(<AccountScreen />, { route: '/account', account: accountAuth })
    const before = services.client.session.current
    expect(await screen.findByTestId('account-save-to')).toHaveTextContent('ana@example.com')
    await userEvent.click(screen.getByTestId('account-save'))
    expect(await screen.findByTestId('account-linked')).toHaveTextContent('ana@example.com')
    expect(screen.getByTestId('account-unverified')).toBeInTheDocument()
    expect(linkBody).toHaveBeenCalledWith({ accountAccessToken: playerFixtures.accountToken, createAccount: false })
    expect(services.client.session.current).toEqual(before)
  })

  it('creates the account first when the phone is not signed in, then links', async () => {
    const linkBody = vi.fn()
    // Signing in refreshes the account queries, so the participation must answer "linked" once it is.
    server.use(
      http.post('/api/player/account/link', async ({ request }) => {
        linkBody(await request.json())
        return HttpResponse.json({ linked: true, email: 'nia@example.com', name: 'Nia', emailVerified: false })
      }),
      http.get('/api/player/account', () => linkBody.mock.calls.length
        ? HttpResponse.json({ linked: true, email: 'nia@example.com', name: 'Nia', emailVerified: false })
        : HttpResponse.json({ linked: false, email: null, name: null, emailVerified: false })),
    )
    const { services } = await renderPlayer(<AccountScreen />, { route: '/account' })
    expect(await screen.findByTestId('account-name')).toHaveValue('David')
    await userEvent.clear(screen.getByTestId('account-email'))
    await userEvent.type(screen.getByTestId('account-email'), 'nia@example.com')
    await userEvent.clear(screen.getByTestId('account-name'))
    await userEvent.type(screen.getByTestId('account-name'), 'Nia')
    await userEvent.type(screen.getByTestId('account-password'), 'Secret123')
    await userEvent.click(screen.getByTestId('account-submit'))
    expect(await screen.findByTestId('account-linked')).toHaveTextContent('nia@example.com')
    // The phone stays signed in afterwards.
    expect(services.account.session.current).toMatchObject({ kind: 'operator', email: 'nia@example.com' })
    expect(linkBody).toHaveBeenCalledWith({ accountAccessToken: playerFixtures.accountToken, createAccount: false })
  })

  it('explains a taken email when creating', async () => {
    await renderPlayer(<AccountScreen />, { route: '/account' })
    await userEvent.type(await screen.findByTestId('account-email'), 'taken@example.com')
    await userEvent.type(screen.getByTestId('account-password'), 'Secret123')
    await userEvent.click(screen.getByTestId('account-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('That email already has an account. Sign in instead.')
  })

  it('offers to switch this phone when the account already plays elsewhere, and recovers on confirm', async () => {
    server.use(http.post('/api/player/account/link', () => HttpResponse.json({ status: 409, message: 'x', code: 'ACCOUNT_ALREADY_IN_GAME', errors: { teamId: 'team9', teamName: 'Owls', sameTeam: 'false' } }, { status: 409 })))
    const { services } = await renderPlayer(<AccountScreen />, { route: '/account', path: '/account', account: accountAuth })
    await userEvent.click(await screen.findByTestId('account-save'))
    expect(await screen.findByText('You already play this game')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(services.client.session.current).toMatchObject({ kind: 'player', playerId: 'p9', teamName: 'Owls' }))
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument()
  })

  it('refuses to switch phones while actions are still queued', async () => {
    server.use(http.post('/api/player/account/link', () => HttpResponse.json({ status: 409, message: 'x', code: 'ACCOUNT_ALREADY_IN_GAME', errors: { teamId: 'team9', teamName: 'Owls', sameTeam: 'false' } }, { status: 409 })))
    const { services } = await renderPlayer(<AccountScreen />, {
      route: '/account', account: accountAuth,
      pending: [{ type: 'check_in', id: 'q1', gameId: 'g1', baseId: 'b2', proof: { type: 'nfc', token: 't' }, createdAt: '2026-09-05T09:00:00Z', attempts: 0, nextAttemptAt: Date.now() + 60_000, state: 'pending' }],
    })
    await userEvent.click(await screen.findByTestId('account-save'))
    expect(await screen.findByRole('alert')).toHaveTextContent('You have 1 unsynced action.')
    expect(services.client.session.current).toMatchObject({ playerId: 'p1' })
  })

  it('lets a wrong account sign out before saving', async () => {
    const { services } = await renderPlayer(<AccountScreen />, { route: '/account', account: accountAuth })
    await userEvent.click(await screen.findByTestId('account-not-you'))
    await waitFor(() => expect(services.account.session.current.kind).toBe('none'))
    expect(await screen.findByTestId('account-submit')).toBeInTheDocument()
  })

  it('offers a retry when the participation cannot be loaded, e.g. offline', async () => {
    server.use(http.get('/api/player/account', () => HttpResponse.error()))
    await renderPlayer(<AccountScreen />, { route: '/account' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
