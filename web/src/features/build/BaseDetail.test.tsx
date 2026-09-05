import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BaseDetail } from './BaseDetail'

// Mock workspace store
const mockStore = {
  selectChallenge: vi.fn(),
  selectedBaseId: 'base-1',
  selectBase: vi.fn(),
  drawerOpen: true,
  drawerTab: 'bases' as const,
}

vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}))

// Mock LocationPicker to avoid WebGL initialization in jsdom
vi.mock('@/components/map/LocationPicker', () => ({
  LocationPicker: ({ lat, lng }: { lat: number; lng: number }) => (
    <div data-testid="location-picker-mock">{lat}, {lng}</div>
  ),
}))

function renderBaseDetail(baseId = 'base-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <BaseDetail baseId={baseId} gameId="game-1" />
    </QueryClientProvider>,
  )
}

describe('BaseDetail', () => {
  beforeEach(() => {
    mockStore.selectChallenge.mockClear()
  })

  it('renders base name after data loads', async () => {
    renderBaseDetail()
    await waitFor(() => {
      expect(screen.getByTestId('base-name-input')).toHaveValue('Base Alpha')
    })
  })

  it('renders NFC linked status', async () => {
    renderBaseDetail()
    await waitFor(() => {
      expect(screen.getByText('NFC linked')).toBeInTheDocument()
    })
  })

  it('renders visibility toggle', async () => {
    renderBaseDetail()
    await waitFor(() => {
      expect(screen.getByTestId('visibility-visible')).toBeInTheDocument()
      expect(screen.getByTestId('visibility-hidden')).toBeInTheDocument()
    })
  })

  it('shows challenges at this base', async () => {
    renderBaseDetail()
    // MSW: assignment-1 links base-1 to challenge-1 (Challenge Alpha)
    await waitFor(() => {
      expect(screen.getByText('Challenge Alpha')).toBeInTheDocument()
    })
  })

  it('clicking challenge name calls selectChallenge', async () => {
    const user = userEvent.setup()
    renderBaseDetail()

    await waitFor(() => {
      expect(screen.getByTestId('challenge-link-challenge-1')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('challenge-link-challenge-1'))
    expect(mockStore.selectChallenge).toHaveBeenCalledWith('challenge-1')
  })

  it('shows "Base not found" for invalid baseId', async () => {
    renderBaseDetail('nonexistent-base')
    // After queries load, the base won't be found
    await waitFor(() => {
      expect(screen.getByText('Base not found')).toBeInTheDocument()
    })
  })

  it('shows save button when form is dirty', async () => {
    const user = userEvent.setup()
    renderBaseDetail()

    await waitFor(() => {
      expect(screen.getByTestId('base-name-input')).toHaveValue('Base Alpha')
    })

    await user.clear(screen.getByTestId('base-name-input'))
    await user.type(screen.getByTestId('base-name-input'), 'Renamed Base')

    await waitFor(() => {
      expect(screen.getByTestId('save-base-btn')).toBeInTheDocument()
    })
  })

  it('renders location picker', async () => {
    renderBaseDetail()
    await waitFor(() => {
      expect(screen.getByTestId('location-picker-mock')).toBeInTheDocument()
    })
  })

  it('renders tags section', async () => {
    renderBaseDetail()
    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })
  })

  it('renders fixed challenge section', async () => {
    renderBaseDetail()
    await waitFor(() => {
      expect(screen.getByText('Fixed Challenge')).toBeInTheDocument()
    })
  })
})
