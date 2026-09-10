import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { accountAuth, renderPlayer } from '@/features/player/test/renderPlayer'
import RecoverScreen from './RecoverScreen'
import Join from './Join'

describe('RecoverScreen', () => {
  it('lists the signed-in account\'s games and brings one back on this phone', async () => {
    const body = vi.fn()
    server.use(http.post('/api/account/participations/:gameId/recover', async ({ request, params }) => {
      body({ gameId: params.gameId, ...(await request.json() as object) })
      return HttpResponse.json({ token: 'recovered-token', player: { id: 'p9', displayName: 'Ana', deviceId: 'dev' }, team: { id: 'team9', name: 'Owls', color: '#8b5cf6' }, game: { id: 'g1', name: 'Serra da Estrela', description: '', status: 'live', tileSource: 'osm' } })
    }))
    const { services } = await renderPlayer(<RecoverScreen />, { auth: null, route: '/join/recover', account: accountAuth })
    expect(await screen.findByTestId('recover-game-g1')).toHaveTextContent('Serra da Estrela')
    expect(screen.getByTestId('recover-game-g1')).toHaveTextContent('Owls')
    await userEvent.click(screen.getByTestId('recover-btn-g1'))
    await waitFor(() => expect(services.client.session.current).toMatchObject({ kind: 'player', playerId: 'p9', token: 'recovered-token' }))
    expect(body).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'g1', deviceId: expect.any(String) }))
  })

  it('shows an empty state for an account with no games', async () => {
    server.use(http.get('/api/account/me', () => HttpResponse.json({ id: 'u-ana', email: 'ana@example.com', name: 'Ana', role: 'participant', emailVerified: true, participations: [] })))
    await renderPlayer(<RecoverScreen />, { auth: null, route: '/join/recover', account: accountAuth })
    expect(await screen.findByTestId('recover-empty')).toHaveTextContent('This account has not joined any game yet.')
  })

  it('asks to sign in first when the phone has no account', async () => {
    await renderPlayer(<RecoverScreen />, { auth: null, route: '/join/recover' })
    expect(await screen.findByTestId('recover-sign-in')).toHaveAttribute('href', '/join/account?mode=signIn&next=/join/recover')
    expect(screen.queryByTestId('recover-list')).not.toBeInTheDocument()
  })

  it('is reachable from the join screen', async () => {
    await renderPlayer(<Join />, { auth: null, route: '/join' })
    expect(await screen.findByTestId('player-join-recover-link')).toHaveAttribute('href', '/join/recover')
  })
})
