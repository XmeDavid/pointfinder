import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockGame } from '@/test/factories/game'
import { useTourStore } from '@/features/tutorials/store'
import { CreateGameDialog } from './CreateGameDialog'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderDialog(open = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CreateGameDialog open={open} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onClose }
}

describe('CreateGameDialog', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders nothing when closed', () => {
    renderDialog(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders form fields when open', () => {
    renderDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create game/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDialog()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('submits and navigates to new game', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDialog()

    await user.type(screen.getByLabelText('Name'), 'My New Game')
    await user.type(screen.getByLabelText('Description'), 'A description')
    await user.click(screen.getByRole('button', { name: /create game/i }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/game\/game-new-/),
      )
    })
  })

  it('flags the game as the first-game practice game while that tutorial runs', async () => {
    const user = userEvent.setup()
    let sent: Record<string, unknown> = {}
    server.use(http.post('/api/games', async ({ request }) => {
      sent = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(createMockGame({ id: 'game-practice', name: String(sent.name) }), { status: 201 })
    }))
    useTourStore.getState().start('first-game')
    renderDialog()

    await user.type(screen.getByLabelText('Name'), 'My first game')
    await user.click(screen.getByRole('button', { name: /create game/i }))

    await waitFor(() => expect(sent.tutorialScenario).toBe('first-game'))
    useTourStore.getState().reset()
  })

  it('sends no tutorial flag outside a first-game run', async () => {
    const user = userEvent.setup()
    let sent: Record<string, unknown> = {}
    server.use(http.post('/api/games', async ({ request }) => {
      sent = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(createMockGame({ id: 'game-plain', name: String(sent.name) }), { status: 201 })
    }))
    renderDialog()

    await user.type(screen.getByLabelText('Name'), 'Real event')
    await user.click(screen.getByRole('button', { name: /create game/i }))

    await waitFor(() => expect(sent.name).toBe('Real event'))
    expect('tutorialScenario' in sent).toBe(false)
  })

  it('sends the operator to billing when the active-game limit refuses the create', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/games', () =>
      HttpResponse.json({ status: 400, message: 'Active game limit reached (1)', code: 'QUOTA_ACTIVE_GAMES_EXCEEDED' }, { status: 400 }),
    ))
    const { onClose } = renderDialog()

    await user.type(screen.getByLabelText('Name'), 'One too many')
    await user.click(screen.getByRole('button', { name: /create game/i }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/billing'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows a localized message for any other rejected create and stays open', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/games', () =>
      HttpResponse.json({ status: 409, message: 'raw server text', code: 'TUTORIAL_PRACTICE_GAME_EXISTS' }, { status: 409 }),
    ))
    const { onClose } = renderDialog()

    await user.type(screen.getByLabelText('Name'), 'Another practice')
    await user.click(screen.getByRole('button', { name: /create game/i }))

    expect(await screen.findByTestId('create-game-error')).toHaveTextContent('You already have a practice game. Delete or keep it first.')
    expect(onClose).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('disables submit when name is empty', () => {
    renderDialog()
    const submitBtn = screen.getByRole('button', { name: /create game/i })
    expect(submitBtn).toBeDisabled()
  })
})
