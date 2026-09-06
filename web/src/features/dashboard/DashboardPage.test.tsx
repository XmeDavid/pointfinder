import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { useTourStore } from '@/features/tutorials/store'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { DashboardPage } from './DashboardPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('shows loading state initially', () => {
    renderPage()
    // Spinner renders a div with animate-spin
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('renders game cards after data loads', async () => {
    renderPage()
    // MSW returns two games: "Test Game 1" and "Test Game 2"
    await waitFor(() => {
      expect(screen.getByText('Test Game 1')).toBeInTheDocument()
    })
    expect(screen.getByText('Test Game 2')).toBeInTheDocument()
  })

  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByText('PointFinder')).toBeInTheDocument()
    expect(screen.getByText('Your Games')).toBeInTheDocument()
  })

  it('renders a create game button', () => {
    renderPage()
    expect(
      screen.getByRole('button', { name: /new game/i }),
    ).toBeInTheDocument()
  })

  it('search filters games by name', async () => {
    const user = userEvent.setup()
    renderPage()

    // Wait for games to load
    await waitFor(() => {
      expect(screen.getByText('Test Game 1')).toBeInTheDocument()
    })

    // Type into search
    const searchInput = screen.getByPlaceholderText('Search games...')
    await user.type(searchInput, 'Game 1')

    // Only the matching game should remain
    await waitFor(() => {
      expect(screen.getByText('Test Game 1')).toBeInTheDocument()
      expect(screen.queryByText('Test Game 2')).not.toBeInTheDocument()
    })
  })

  it('create game button opens dialog', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /new game/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('navigates to game on card click', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Test Game 1')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Test Game 1'))
    expect(mockNavigate).toHaveBeenCalledWith('/game/game-1')
  })
})

describe('DashboardPage tutorial welcome card', () => {
  beforeEach(() => {
    useTourStore.getState().reset()
    useWorkspaceContext.setState({ active: { type: 'personal' } })
  })

  it('shows the tutorial welcome card when the operator has no games', async () => {
    server.use(http.get('/api/games', () => HttpResponse.json([])))

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('tutorial-welcome-card')).toBeInTheDocument()
    })
    expect(screen.getByTestId('dashboard-empty-state')).toBeInTheDocument()
  })

  it('hides the tutorial welcome card once games exist', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Test Game 1')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('tutorial-welcome-card')).not.toBeInTheDocument()
  })
})
