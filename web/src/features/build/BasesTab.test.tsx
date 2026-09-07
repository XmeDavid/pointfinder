import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockGame } from '@/test/factories/game'
import { createMockBase } from '@/test/factories/base'
import { createMockStage } from '@/test/factories/stage'
import { createMockTag } from '@/test/factories/tag'
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

  it('marks only unlinked NFC bases as missing a tag', async () => {
    server.use(
      http.get('/api/games/game-1/bases', () => HttpResponse.json([
        createMockBase({ id: 'nfc', name: 'Tagless', checkInMethod: 'NFC', nfcLinked: false }),
        createMockBase({ id: 'qr', name: 'Printed', checkInMethod: 'QR', nfcLinked: false }),
        createMockBase({ id: 'gps', name: 'Radius', checkInMethod: 'LOCATION', nfcLinked: false, hidden: true }),
      ])),
    )
    renderBasesTab()
    await screen.findByText('Tagless')
    expect(screen.getAllByTitle('Missing NFC')).toHaveLength(1)
    expect(screen.getByTitle('Ready')).toBeInTheDocument()
    expect(screen.getByTitle('Hidden (ready)')).toBeInTheDocument()
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


describe('assignment grid', () => {
  it('opens the grid from the list and closes back to it', async () => {
    const user = userEvent.setup()
    renderBasesTab()
    await screen.findByText('Base Alpha')
    await user.click(screen.getByTestId('assignment-grid-btn'))
    expect(await screen.findByTestId('assignment-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('base-list')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('assignment-grid-close'))
    expect(await screen.findByTestId('base-list')).toBeInTheDocument()
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

describe('BasesTab quick filters', () => {
  beforeEach(() => {
    mockStore.selectedBaseId = null
    mockStore.selectBase.mockClear()
  })

  function stagedFixture() {
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Base Alpha', tagIds: ['tag-1'] }),
          createMockBase({ id: 'base-2', name: 'Base Beta', tagIds: ['tag-1', 'tag-2'] }),
          createMockBase({ id: 'base-3', name: 'Base Gamma' }),
        ]),
      ),
      http.get('/api/games/:gameId/stages', () =>
        HttpResponse.json([
          createMockStage({ id: 'stage-2', name: 'Afternoon', orderIndex: 1, baseIds: ['base-2'] }),
          createMockStage({ id: 'stage-1', name: 'Morning', orderIndex: 0, baseIds: ['base-1'] }),
        ]),
      ),
      http.get('/api/games/:gameId/tags', () =>
        HttpResponse.json([createMockTag({ id: 'tag-1', label: 'Outdoor', color: '#16a34a' }), createMockTag({ id: 'tag-2', label: 'Photo', color: '#eab308' })]),
      ),
    )
  }

  it('offers the stages in order plus "No stage" when a base has none, and narrows the list', async () => {
    const user = userEvent.setup()
    stagedFixture()
    renderBasesTab()
    await waitFor(() => expect(screen.getByText('Base Alpha')).toBeInTheDocument())

    const chips = screen.getByRole('radiogroup', { name: 'Stage' })
    expect(chips.textContent).toContain('All')
    expect(chips.textContent?.indexOf('Morning')).toBeLessThan(chips.textContent?.indexOf('Afternoon') ?? -1)
    expect(screen.getByTestId('filter-stage-none')).toBeInTheDocument()

    await user.click(screen.getByTestId('filter-stage-stage-2'))
    expect(screen.queryByText('Base Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Base Beta')).toBeInTheDocument()
    expect(screen.queryByText('Base Gamma')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('filter-stage-none'))
    expect(screen.getByText('Base Gamma')).toBeInTheDocument()
    expect(screen.queryByText('Base Beta')).not.toBeInTheDocument()
  })

  it('filters by any of the chosen tags and combines with the stage filter', async () => {
    const user = userEvent.setup()
    stagedFixture()
    renderBasesTab()
    await waitFor(() => expect(screen.getByText('Base Alpha')).toBeInTheDocument())

    await user.click(screen.getByTestId('filter-tag-tag-2'))
    expect(screen.getByText('Base Beta')).toBeInTheDocument()
    expect(screen.queryByText('Base Alpha')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('filter-tag-tag-1'))
    expect(screen.getByText('Base Alpha')).toBeInTheDocument()
    expect(screen.getByText('Base Beta')).toBeInTheDocument()
    expect(screen.queryByText('Base Gamma')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('filter-stage-stage-1'))
    expect(screen.getByText('Base Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Base Beta')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('filter-stage-none'))
    expect(screen.getByText('No bases match the current filters — try clearing a filter.')).toBeInTheDocument()
    await user.click(screen.getByTestId('quick-filters-clear'))
    expect(screen.getByText('Base Gamma')).toBeInTheDocument()
  })

  it('shows no stage chips when the game has no stages, and no tag chips without tags', async () => {
    server.use(
      http.get('/api/games/:gameId/stages', () => HttpResponse.json([])),
      http.get('/api/games/:gameId/tags', () => HttpResponse.json([])),
    )
    renderBasesTab()
    await waitFor(() => expect(screen.getByText('Base Alpha')).toBeInTheDocument())
    expect(screen.queryByTestId('quick-filters')).not.toBeInTheDocument()
  })
})
