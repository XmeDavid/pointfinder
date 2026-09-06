import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockGame } from '@/test/factories/game'
import { SetupGamePicker } from './SetupGamePicker'

function renderPicker(onPick = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SetupGamePicker open onClose={onClose} onPick={onPick} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onPick, onClose }
}

describe('SetupGamePicker', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/games', () =>
        HttpResponse.json([
          createMockGame({ id: 'game-setup-1', name: 'Setup One', status: 'setup' }),
          createMockGame({ id: 'game-setup-2', name: 'Setup Two', status: 'setup' }),
          createMockGame({ id: 'game-live', name: 'Live One', status: 'live' }),
          createMockGame({ id: 'game-ended', name: 'Ended One', status: 'ended' }),
        ]),
      ),
    )
  })

  it('lists only games in setup', async () => {
    renderPicker()

    await waitFor(() => expect(screen.getByTestId('setup-game-option-game-setup-1')).toBeInTheDocument())
    expect(screen.getByTestId('setup-game-option-game-setup-2')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-game-option-game-live')).not.toBeInTheDocument()
    expect(screen.queryByTestId('setup-game-option-game-ended')).not.toBeInTheDocument()
  })

  it('hands the chosen game id back', async () => {
    const user = userEvent.setup()
    const { onPick } = renderPicker()
    await waitFor(() => expect(screen.getByTestId('setup-game-option-game-setup-2')).toBeInTheDocument())

    await user.click(screen.getByTestId('setup-game-option-game-setup-2'))

    expect(onPick).toHaveBeenCalledWith('game-setup-2')
  })

  it('shows an empty state when nothing is in setup', async () => {
    server.use(http.get('/api/games', () => HttpResponse.json([createMockGame({ id: 'game-live', status: 'live' })])))
    renderPicker()

    await waitFor(() => expect(screen.getByText(/no games in setup/i)).toBeInTheDocument())
    expect(screen.getByTestId('setup-game-create')).toBeInTheDocument()
  })

  it('creating a game picks it without navigating away', async () => {
    server.use(
      http.post('/api/games', () =>
        HttpResponse.json(createMockGame({ id: 'game-brand-new', status: 'setup' }), { status: 201 }),
      ),
    )
    const user = userEvent.setup()
    const { onPick } = renderPicker()
    await waitFor(() => expect(screen.getByTestId('setup-game-create')).toBeInTheDocument())

    await user.click(screen.getByTestId('setup-game-create'))
    await user.type(screen.getByTestId('game-name-input'), 'Route Rehearsal')
    await user.click(screen.getByTestId('game-save-btn'))

    await waitFor(() => expect(onPick).toHaveBeenCalledWith('game-brand-new'))
  })
})
