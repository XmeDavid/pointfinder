import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { accountAuth, renderPlayer } from '@/features/player/test/renderPlayer'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { vi } from 'vitest'
import Join from './Join'

describe('Join', () => {
  it('joins with a typed code and name, then holds a player session', async () => {
    const { services } = await renderPlayer(<Join />, { auth: null, route: '/join' })
    await userEvent.type(await screen.findByTestId('player-join-code-input'), 'falcons1')
    await userEvent.type(screen.getByTestId('player-join-name-input'), 'David')
    await userEvent.click(screen.getByTestId('player-join-submit-btn'))
    await waitFor(() => expect(services.client.session.current.kind).toBe('player'))
    expect(services.client.session.current).toMatchObject({ teamName: 'Falcons', displayName: 'David' })
  })

  it('explains an unknown code and stays on the form', async () => {
    const { services } = await renderPlayer(<Join />, { auth: null, route: '/join' })
    await userEvent.type(await screen.findByTestId('player-join-code-input'), 'BADCODE')
    await userEvent.type(screen.getByTestId('player-join-name-input'), 'David')
    await userEvent.click(screen.getByTestId('player-join-submit-btn'))
    expect(await screen.findByRole('alert')).toHaveTextContent("That code doesn't match any team.")
    expect(services.client.session.current.kind).toBe('none')
  })

  it('prefills the code from a join link and hides the scanner in a browser', async () => {
    await renderPlayer(<Join />, { auth: null, route: '/join?code=https%3A%2F%2Fpointfinder.pt%2Fjoin%3Fcode%3Dabc123' })
    expect(await screen.findByTestId('player-join-code-input')).toHaveValue('ABC123')
    expect(screen.queryByTestId('player-join-scan-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('disclosure-continue-btn')).not.toBeInTheDocument()
  })

  it('joins as the signed-in account and gets an existing participation back', async () => {
    const body = vi.fn()
    server.use(http.post('/api/account/join', async ({ request }) => {
      body(await request.json())
      return HttpResponse.json({ token: 'recovered-token', player: { id: 'p9', displayName: 'Ana', deviceId: 'dev' }, team: { id: 'team9', name: 'Owls', color: '#8b5cf6' }, game: { id: 'g1', name: 'Serra da Estrela', description: '', status: 'live', tileSource: 'osm' } })
    }))
    const { services } = await renderPlayer(<Join />, { auth: null, route: '/join', account: accountAuth })
    expect(await screen.findByTestId('join-signed-in')).toHaveTextContent('ana@example.com')
    expect(screen.queryByTestId('player-join-sign-in-link')).not.toBeInTheDocument()
    await userEvent.type(screen.getByTestId('player-join-code-input'), 'owls01')
    await userEvent.type(screen.getByTestId('player-join-name-input'), 'Ana')
    await userEvent.click(screen.getByTestId('player-join-submit-btn'))
    await waitFor(() => expect(services.client.session.current).toMatchObject({ kind: 'player', playerId: 'p9', teamName: 'Owls' }))
    expect(body).toHaveBeenCalledWith(expect.objectContaining({ joinCode: 'OWLS01', displayName: 'Ana' }))
  })

  it('offers sign-in and account creation to a phone without an account', async () => {
    await renderPlayer(<Join />, { auth: null, route: '/join' })
    expect(await screen.findByTestId('player-join-sign-in-link')).toHaveAttribute('href', '/join/account?mode=signIn&next=/join')
    expect(screen.getByTestId('player-join-create-link')).toHaveAttribute('href', '/join/account?next=/join')
    expect(screen.queryByTestId('join-signed-in')).not.toBeInTheDocument()
  })

  it('signs the account out from the join screen', async () => {
    const { services } = await renderPlayer(<Join />, { auth: null, route: '/join', account: accountAuth })
    await userEvent.click(await screen.findByTestId('join-sign-out'))
    await waitFor(() => expect(services.account.session.current.kind).toBe('none'))
    expect(await screen.findByTestId('player-join-sign-in-link')).toBeInTheDocument()
  })
})
