import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { accountAuth, renderPlayer } from '@/features/player/test/renderPlayer'
import SettingsScreen from './SettingsScreen'

describe('SettingsScreen', () => {
  it('shows game, team, progress and device facts', async () => {
    await renderPlayer(<SettingsScreen />)
    expect(await screen.findByText('Serra da Estrela')).toBeInTheDocument()
    expect(screen.getByText('Falcons')).toBeInTheDocument()
    expect(screen.getByText('David')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('settings-total-bases')).toHaveTextContent('3'))
    expect(screen.getByTestId('settings-completed')).toHaveTextContent('1')
    expect(screen.getByTestId('settings-pending-actions')).toHaveTextContent('0')
  })

  it('offers to save progress when the phone has no account', async () => {
    await renderPlayer(<SettingsScreen />)
    expect(await screen.findByTestId('settings-save-progress')).toHaveAttribute('href', '/account')
    expect(screen.queryByTestId('settings-sign-out')).not.toBeInTheDocument()
  })

  it('offers to save this game to the signed-in account, or sign out', async () => {
    const { services } = await renderPlayer(<SettingsScreen />, { account: accountAuth })
    const signedIn = await screen.findByTestId('settings-account-signed-in')
    expect(signedIn).toHaveTextContent('ana@example.com')
    expect(screen.getByTestId('settings-save-progress')).toHaveTextContent('Save this game to ana@example.com')
    await userEvent.click(screen.getByTestId('settings-sign-out'))
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(services.account.session.current.kind).toBe('none'))
  })

  it('shows the linked account with resend, unlink and delete', async () => {
    const resent = vi.fn(); const unlinked = vi.fn(); const deleted = vi.fn()
    server.use(
      http.get('/api/player/account', () => unlinked.mock.calls.length ? HttpResponse.json({ linked: false, email: null, name: null, emailVerified: false }) : HttpResponse.json({ linked: true, email: 'ana@example.com', name: 'Ana', emailVerified: false })),
      http.post('/api/account/resend-verification', () => { resent(); return HttpResponse.json({ message: 'sent' }) }),
      http.delete('/api/player/account/link', () => { unlinked(); return HttpResponse.json({ linked: false, email: null, name: null, emailVerified: false }) }),
      http.delete('/api/account', () => { deleted(); return new HttpResponse(null, { status: 204 }) }),
    )
    await renderPlayer(<SettingsScreen />, { account: accountAuth })
    const linked = await screen.findByTestId('settings-account-linked')
    expect(linked).toHaveTextContent('ana@example.com')
    expect(linked).toHaveTextContent('Email not confirmed yet')
    await userEvent.click(screen.getByTestId('settings-resend-verification'))
    await waitFor(() => expect(resent).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('settings-account-unverified')).toHaveTextContent('Email sent.')
    expect(screen.getByTestId('settings-delete-account')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('settings-unlink'))
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(unlinked).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('settings-account-signed-in')).toBeInTheDocument()
  })

  it('deletes a participant account and leaves the participation as a guest', async () => {
    const deleted = vi.fn()
    server.use(
      http.get('/api/player/account', () => deleted.mock.calls.length ? HttpResponse.json({ linked: false, email: null, name: null, emailVerified: false }) : HttpResponse.json({ linked: true, email: 'ana@example.com', name: 'Ana', emailVerified: true })),
      http.delete('/api/account', () => { deleted(); return new HttpResponse(null, { status: 204 }) }),
    )
    const { services } = await renderPlayer(<SettingsScreen />, { account: accountAuth })
    await screen.findByTestId('settings-account-linked')
    await userEvent.click(screen.getByTestId('settings-delete-account'))
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(deleted).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(services.account.session.current.kind).toBe('none'))
    expect(services.client.session.current).toMatchObject({ kind: 'player', playerId: 'p1' })
    expect(await screen.findByTestId('settings-save-progress')).toBeInTheDocument()
  })

  it('leaves the game after a plain confirmation when nothing is queued', async () => {
    const { services } = await renderPlayer(<SettingsScreen />)
    await screen.findByText('Serra da Estrela')
    await userEvent.click(screen.getByRole('button', { name: 'Leave Game' }))
    expect(screen.getByText('Leave Game?')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(services.client.session.current.kind).toBe('none'))
  })

  it('warns about unsynced actions before leaving', async () => {
    await renderPlayer(<SettingsScreen />, {
      pending: [{ type: 'check_in', id: 'q1', gameId: 'g1', baseId: 'b2', proof: { type: 'nfc', token: 't' }, createdAt: '2026-09-05T09:00:00Z', attempts: 0, nextAttemptAt: Date.now() + 60_000, state: 'pending' }],
    })
    await waitFor(() => expect(screen.getByTestId('settings-pending-actions')).toHaveTextContent('1'))
    await userEvent.click(screen.getByRole('button', { name: 'Leave Game' }))
    expect(screen.getByText('Unsynced Actions')).toBeInTheDocument()
    expect(screen.getByText(/1 unsynced action/)).toBeInTheDocument()
  })

  it('deletes the account and ends the session', async () => {
    const deleted = vi.fn()
    server.use(http.delete('/api/player/me', () => { deleted(); return new HttpResponse(null, { status: 204 }) }))
    const { services } = await renderPlayer(<SettingsScreen />)
    await screen.findByText('Serra da Estrela')
    await userEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(deleted).toHaveBeenCalled())
    await waitFor(() => expect(services.client.session.current.kind).toBe('none'))
  })

  it('keeps the session and explains when deletion fails', async () => {
    server.use(http.delete('/api/player/me', () => HttpResponse.json({ message: 'Server exploded' }, { status: 500 })))
    const { services } = await renderPlayer(<SettingsScreen />)
    await screen.findByText('Serra da Estrela')
    await userEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Server exploded|Could not delete/)
    expect(services.client.session.current.kind).toBe('player')
  })
})
