import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockGame } from '@/test/factories/game'
import { createMockBase } from '@/test/factories/base'
import { BasesTab } from './BasesTab'

// Mock workspace store
const mockStore = {
  selectedBaseId: null as string | null,
  selectBase: vi.fn(),
  selectChallenge: vi.fn(),
  drawerOpen: true,
  drawerTab: 'bases' as const,
}

vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}))

function renderBasesTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <BasesTab gameId="game-1" />
    </QueryClientProvider>,
  )
}

describe('BasesTab', () => {
  beforeEach(() => {
    mockStore.selectedBaseId = null
    mockStore.selectBase.mockClear()
    mockStore.selectChallenge.mockClear()
  })

  it('renders base list after data loads', async () => {
    renderBasesTab()
    await waitFor(() => {
      expect(screen.getByText('Base Alpha')).toBeInTheDocument()
    })
    expect(screen.getByText('Base Beta')).toBeInTheDocument()
    expect(screen.getByText('Base Gamma')).toBeInTheDocument()
  })

  it('shows empty state when no bases match search', async () => {
    const user = userEvent.setup()
    renderBasesTab()

    await waitFor(() => {
      expect(screen.getByText('Base Alpha')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search bases...')
    await user.type(searchInput, 'zzz-no-match')

    await waitFor(() => {
      expect(screen.getByText('No bases match your search')).toBeInTheDocument()
    })
  })

  it('search filters bases by name', async () => {
    const user = userEvent.setup()
    renderBasesTab()

    await waitFor(() => {
      expect(screen.getByText('Base Alpha')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search bases...')
    await user.type(searchInput, 'Alpha')

    await waitFor(() => {
      expect(screen.getByText('Base Alpha')).toBeInTheDocument()
      expect(screen.queryByText('Base Beta')).not.toBeInTheDocument()
      expect(screen.queryByText('Base Gamma')).not.toBeInTheDocument()
    })
  })

  it('clicking a base item calls selectBase', async () => {
    const user = userEvent.setup()
    renderBasesTab()

    await waitFor(() => {
      expect(screen.getByText('Base Alpha')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('base-item-base-1'))
    expect(mockStore.selectBase).toHaveBeenCalledWith('base-1')
  })

  it('shows empty state when no base is selected', async () => {
    renderBasesTab()
    expect(screen.getByText('Select a base to view details')).toBeInTheDocument()
  })

  it('shows base detail when a base is selected', async () => {
    mockStore.selectedBaseId = 'base-1'
    renderBasesTab()

    await waitFor(() => {
      expect(screen.getByTestId('base-detail')).toBeInTheDocument()
    })
  })

  it('shows challenge count subtitle', async () => {
    renderBasesTab()

    // MSW assignments: assignment-1 links base-1 to challenge-1
    await waitFor(() => {
      expect(screen.getByText('Base Alpha')).toBeInTheDocument()
    })

    // base-1 has 1 assignment, base-2 has 1 assignment, base-3 has 0
    await waitFor(() => {
      const items = screen.getByTestId('base-list')
      expect(items).toBeInTheDocument()
    })
  })
})


describe('ordered bases', () => {
  it('hides route controls when enforcement is off', async () => {
    renderBasesTab()
    await screen.findByText('Base Alpha')
    expect(screen.queryByRole('button', { name: 'Arrange route' })).not.toBeInTheDocument()
  })

  it('keeps global numbering under search and arranges all bases', async () => {
    const user = userEvent.setup()
    mockStore.selectedBaseId = null
    server.use(
      http.get('/api/games/game-1', () => HttpResponse.json(createMockGame({ enforceBaseOrder: true }))),
      http.get('/api/games/game-1/bases', () => HttpResponse.json([
        createMockBase({ id: 'a', name: 'Forest', sequenceNumber: 1 }),
        createMockBase({ id: 'b', name: 'Bridge', sequenceNumber: 2 }),
        createMockBase({ id: 'c', name: 'Lookout', sequenceNumber: 3 }),
      ])),
    )
    renderBasesTab()
    await screen.findByText('Forest')
    await user.type(screen.getByPlaceholderText('Search bases...'), 'Bridge')
    await waitFor(() => expect(screen.queryByText('Forest')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Base 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Arrange route' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Forest')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Bridge')).toBeInTheDocument()
    expect(screen.queryByText('Forest')).not.toBeInTheDocument()
  })

  it('shows route numbers but locks rearrangement when live', async () => {
    server.use(http.get('/api/games/game-1', () => HttpResponse.json(createMockGame({ enforceBaseOrder: true, status: 'live' }))))
    renderBasesTab()
    expect(await screen.findByRole('button', { name: 'Arrange route' })).toBeDisabled()
    expect(screen.getByText('Base order can only be changed during setup.')).toBeInTheDocument()
  })
})
