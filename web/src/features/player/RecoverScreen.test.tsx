import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderPlayer } from '@/features/player/test/renderPlayer'
import RecoverScreen from './RecoverScreen'
import Join from './Join'

async function fill(email: string, password: string, code: string) {
  await userEvent.type(await screen.findByTestId('recover-email'), email)
  await userEvent.type(screen.getByTestId('recover-password'), password)
  await userEvent.type(screen.getByTestId('recover-code'), code)
  await userEvent.click(screen.getByTestId('recover-submit'))
}

describe('RecoverScreen', () => {
  it('recovers the participation and holds a player session for it', async () => {
    const body = vi.fn()
    server.use(http.post('/api/auth/player/recover', async ({ request }) => {
      body(await request.json())
      return HttpResponse.json({ token: 'recovered-token', player: { id: 'p9', displayName: 'Ana', deviceId: 'dev' }, team: { id: 'team9', name: 'Owls', color: '#8b5cf6' }, game: { id: 'g1', name: 'Serra da Estrela', description: '', status: 'live', tileSource: 'osm' } })
    }))
    const { services } = await renderPlayer(<RecoverScreen />, { auth: null, route: '/join/recover' })
    await fill('ana@example.com', 'Secret123', 'owls01')
    await waitFor(() => expect(services.client.session.current).toMatchObject({ kind: 'player', playerId: 'p9', teamName: 'Owls', token: 'recovered-token' }))
    expect(body).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com', password: 'Secret123', joinCode: 'OWLS01', deviceId: expect.any(String) }))
  })

  it('explains an account that never joined that game, and a wrong password', async () => {
    const { services } = await renderPlayer(<RecoverScreen />, { auth: null, route: '/join/recover' })
    await fill('ana@example.com', 'Secret123', 'NOPE01')
    expect(await screen.findByRole('alert')).toHaveTextContent("This account hasn't joined that game.")
    await userEvent.clear(screen.getByTestId('recover-code'))
    await userEvent.clear(screen.getByTestId('recover-password'))
    await userEvent.type(screen.getByTestId('recover-password'), 'wrong')
    await userEvent.type(screen.getByTestId('recover-code'), 'OWLS01')
    await userEvent.click(screen.getByTestId('recover-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
    expect(services.client.session.current.kind).toBe('none')
  })

  it('is reachable from the join screen', async () => {
    await renderPlayer(<Join />, { auth: null, route: '/join' })
    expect(await screen.findByTestId('player-join-recover-link')).toHaveAttribute('href', '/join/recover')
  })
})
