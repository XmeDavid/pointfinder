import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { PracticeGameChoices } from './PracticeGameChoices'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderChoices(onDone = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PracticeGameChoices gameId="practice-1" onDone={onDone} compact />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return onDone
}

describe('PracticeGameChoices', () => {
  beforeEach(() => mockNavigate.mockClear())

  it('keeps the game and reports it is now a normal game', async () => {
    const user = userEvent.setup()
    const onDone = renderChoices()

    await user.click(screen.getByTestId('practice-keep-btn'))

    expect(await screen.findByTestId('practice-game-message')).toHaveTextContent('This is now a normal game.')
    expect(onDone).toHaveBeenCalledOnce()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('sends the operator to billing when keeping needs a free slot', async () => {
    server.use(http.post('/api/games/:id/keep', () =>
      HttpResponse.json({ status: 400, message: 'Active game limit reached (1)', code: 'QUOTA_ACTIVE_GAMES_EXCEEDED' }, { status: 400 }),
    ))
    const user = userEvent.setup()
    const onDone = renderChoices()

    await user.click(screen.getByTestId('practice-keep-btn'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/billing'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('deletes only after confirming, then returns to the dashboard', async () => {
    const deleted: string[] = []
    server.use(http.delete('/api/games/:id', ({ params }) => {
      deleted.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }))
    const user = userEvent.setup()
    const onDone = renderChoices()

    await user.click(screen.getByTestId('practice-delete-btn'))
    expect(await screen.findByText('Delete this practice game?')).toBeInTheDocument()
    expect(deleted).toEqual([])

    await user.click(screen.getByTestId('confirm-action-btn'))

    await waitFor(() => expect(deleted).toEqual(['practice-1']))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('reports a failed delete and stays put', async () => {
    server.use(http.delete('/api/games/:id', () => HttpResponse.json({ status: 500, message: 'boom' }, { status: 500 })))
    const user = userEvent.setup()
    const onDone = renderChoices()

    await user.click(screen.getByTestId('practice-delete-btn'))
    await user.click(screen.getByTestId('confirm-action-btn'))

    expect(await screen.findByTestId('practice-game-message')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
