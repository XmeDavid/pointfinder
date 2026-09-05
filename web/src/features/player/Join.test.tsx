import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderPlayer } from '@/features/player/test/renderPlayer'
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
})
