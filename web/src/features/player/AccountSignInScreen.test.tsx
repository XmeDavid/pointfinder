import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderPlayer } from '@/features/player/test/renderPlayer'
import { playerFixtures } from '@/test/msw/handlers/player'
import AccountSignInScreen from './AccountSignInScreen'

describe('AccountSignInScreen', () => {
  it('creates a participant account, keeps it signed in, and continues to the join screen', async () => {
    const { services } = await renderPlayer(<AccountSignInScreen />, { auth: null, route: '/join/account?next=/join', path: '/join/account' })
    await userEvent.type(await screen.findByTestId('account-email'), 'nia@example.com')
    await userEvent.type(screen.getByTestId('account-name'), 'Nia')
    await userEvent.type(screen.getByTestId('account-password'), 'Secret123')
    await userEvent.click(screen.getByTestId('account-submit'))
    await waitFor(() => expect(services.account.session.current).toMatchObject({ kind: 'operator', email: 'nia@example.com', role: 'participant' }))
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument()
    expect(services.client.session.current.kind).toBe('none')
  })

  it('signs in to an existing account and explains a wrong password', async () => {
    server.use(http.post('/api/auth/login', async ({ request }) => {
      const body = await request.json() as { password: string }
      if (body.password !== 'Secret123') return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 })
      return HttpResponse.json({ accessToken: playerFixtures.accountToken, refreshToken: 'refresh-ana', user: { id: 'u-ana', email: 'ana@example.com', name: 'Ana', role: 'participant', createdAt: '2026-01-01T00:00:00Z' } })
    }))
    const { services } = await renderPlayer(<AccountSignInScreen />, { auth: null, route: '/join/account?mode=signIn&next=/join/recover', path: '/join/account' })
    await userEvent.type(await screen.findByTestId('account-email'), 'ana@example.com')
    await userEvent.type(screen.getByTestId('account-password'), 'wrong')
    await userEvent.click(screen.getByTestId('account-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
    await userEvent.clear(screen.getByTestId('account-password'))
    await userEvent.type(screen.getByTestId('account-password'), 'Secret123')
    await userEvent.click(screen.getByTestId('account-submit'))
    await waitFor(() => expect(services.account.session.current).toMatchObject({ kind: 'operator', email: 'ana@example.com' }))
  })

  it('does not follow an off-site next parameter', async () => {
    await renderPlayer(<AccountSignInScreen />, { auth: null, route: '/join/account?next=https://evil.test', path: '/join/account' })
    await userEvent.type(await screen.findByTestId('account-email'), 'nia@example.com')
    await userEvent.type(screen.getByTestId('account-name'), 'Nia')
    await userEvent.type(screen.getByTestId('account-password'), 'Secret123')
    await userEvent.click(screen.getByTestId('account-submit'))
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument()
  })
})
