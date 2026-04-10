import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
        expect.stringMatching(/^\/app\/game\/game-new-/),
      )
    })
  })

  it('disables submit when name is empty', () => {
    renderDialog()
    const submitBtn = screen.getByRole('button', { name: /create game/i })
    expect(submitBtn).toBeDisabled()
  })
})
