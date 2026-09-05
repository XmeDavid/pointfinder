import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderPlayer } from '@/features/player/test/renderPlayer'
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
