import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderPlayer } from '@/features/player/test/renderPlayer'
import AccountScreen from './AccountScreen'

async function fill(email: string, password: string, name?: string) {
  await userEvent.clear(await screen.findByTestId('account-email'))
  await userEvent.type(screen.getByTestId('account-email'), email)
  if (name !== undefined) {
    await userEvent.clear(screen.getByTestId('account-name'))
    await userEvent.type(screen.getByTestId('account-name'), name)
  }
  await userEvent.type(screen.getByTestId('account-password'), password)
  await userEvent.click(screen.getByTestId('account-submit'))
}

describe('AccountScreen', () => {
  it('creates an account and links the current participation without changing the session', async () => {
    const linkBody = vi.fn()
    server.use(http.post('/api/player/account/link', async ({ request }) => {
      const body = await request.json()
      linkBody(body)
      return HttpResponse.json({ linked: true, email: 'ana@example.com', name: 'Ana', emailVerified: false })
    }))
    const { services } = await renderPlayer(<AccountScreen />, { route: '/account' })
    const before = services.client.session.current
    expect(await screen.findByTestId('account-name')).toHaveValue('David')
    await fill('ana@example.com', 'Secret123', 'Ana')
    expect(await screen.findByTestId('account-linked')).toHaveTextContent('ana@example.com')
    expect(screen.getByTestId('account-unverified')).toBeInTheDocument()
    expect(linkBody).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'Secret123', name: 'Ana', createAccount: true })
    expect(services.client.session.current).toEqual(before)
  })

  it('signs in to an existing account instead when asked', async () => {
    const linkBody = vi.fn()
    server.use(http.post('/api/player/account/link', async ({ request }) => {
      linkBody(await request.json())
      return HttpResponse.json({ linked: true, email: 'ana@example.com', name: 'Ana', emailVerified: true })
    }))
    await renderPlayer(<AccountScreen />, { route: '/account' })
    await userEvent.click(await screen.findByTestId('account-mode-signin'))
    expect(screen.queryByTestId('account-name')).not.toBeInTheDocument()
    await fill('ana@example.com', 'Secret123')
    await screen.findByTestId('account-linked')
    expect(linkBody).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'Secret123', createAccount: false })
    expect(screen.queryByTestId('account-unverified')).not.toBeInTheDocument()
  })

  it('explains a taken email and a wrong password', async () => {
    await renderPlayer(<AccountScreen />, { route: '/account' })
    await fill('taken@example.com', 'Secret123', 'Ana')
    expect(await screen.findByRole('alert')).toHaveTextContent('That email already has an account. Sign in instead.')
    await userEvent.click(screen.getByTestId('account-mode-signin'))
    await userEvent.clear(screen.getByTestId('account-password'))
    await fill('ana@example.com', 'wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
  })

  it('offers to switch this phone when the account already plays elsewhere, and recovers on confirm', async () => {
    const { services } = await renderPlayer(<AccountScreen />, { route: '/account', path: '/account' })
    await userEvent.click(await screen.findByTestId('account-mode-signin'))
    await fill('elsewhere@example.com', 'Secret123')
    expect(await screen.findByText('You already play this game')).toBeInTheDocument()
    expect(screen.getByText(/already playing as Owls on another phone/)).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(services.client.session.current).toMatchObject({ kind: 'player', playerId: 'p9', teamName: 'Owls' }))
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument()
  })

  it('refuses to switch phones while actions are still queued', async () => {
    const { services } = await renderPlayer(<AccountScreen />, {
      route: '/account',
      pending: [{ type: 'check_in', id: 'q1', gameId: 'g1', baseId: 'b2', proof: { type: 'nfc', token: 't' }, createdAt: '2026-09-05T09:00:00Z', attempts: 0, nextAttemptAt: Date.now() + 60_000, state: 'pending' }],
    })
    await userEvent.click(await screen.findByTestId('account-mode-signin'))
    await fill('elsewhere@example.com', 'Secret123')
    expect(await screen.findByRole('alert')).toHaveTextContent('You have 1 unsynced action.')
    expect(screen.queryByText('You already play this game')).not.toBeInTheDocument()
    expect(services.client.session.current).toMatchObject({ playerId: 'p1' })
  })

  it('shows the linked account instead of the form when already saved', async () => {
    server.use(http.get('/api/player/account', () => HttpResponse.json({ linked: true, email: 'ana@example.com', name: 'Ana', emailVerified: true })))
    await renderPlayer(<AccountScreen />, { route: '/account' })
    expect(await screen.findByTestId('account-linked')).toHaveTextContent('ana@example.com')
    expect(screen.queryByTestId('account-submit')).not.toBeInTheDocument()
  })
})
