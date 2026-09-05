import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BaseDetail } from './BaseDetail'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase } from '@/test/factories/base'
import { createMockGame } from '@/test/factories/game'

const platform = vi.hoisted(() => ({ native: false }))
vi.mock('@/platform', () => ({ isNative: () => platform.native }))

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
  LocationPicker: ({ lat, lng, radiusM }: { lat: number; lng: number; radiusM?: number | null }) => (
    <div data-testid="location-picker-mock" data-radius={radiusM ?? ''}>
      {lat}, {lng}
    </div>
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

const QR_BASE_ID = '0d2f1c9e-0000-4000-8000-000000000001'

describe('BaseDetail', () => {
  beforeEach(() => {
    platform.native = false
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

  it('can link the selected base to an NFC tag in the native app', async () => {
    platform.native = true
    renderBaseDetail()
    expect(await screen.findByTestId('nfc-write-base-1')).toBeInTheDocument()
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

  it('lets the operator switch the base to QR and shows the printable code', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          // Codes encode the tag URL, which needs a real base UUID.
          createMockBase({ id: QR_BASE_ID, name: 'Base Alpha', nfcToken: 'ab12cd34', checkInMethod: 'QR' }),
        ]),
      ),
    )
    renderBaseDetail(QR_BASE_ID)

    const qr = await screen.findByTestId('base-qr-code')
    expect(qr.querySelector('title')?.textContent).toContain(QR_BASE_ID)
    expect(screen.getByTestId('base-qr-print')).toBeInTheDocument()

    await user.click(screen.getByTestId('base-checkin-method-nfc'))
    expect(screen.queryByTestId('base-qr-code')).not.toBeInTheDocument()
  })

  it('shows the radius field and draws the ring for a location base', async () => {
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'game-1', defaultCheckInMethod: 'LOCATION', defaultCheckInRadiusM: 25 })),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({
            id: 'base-1',
            name: 'Base Alpha',
            checkInMethod: 'LOCATION',
            checkInRadiusM: null,
          }),
        ]),
      ),
    )
    renderBaseDetail()

    await waitFor(() => {
      expect(screen.getByTestId('base-checkin-radius')).toHaveValue(null)
    })
    expect(screen.getByTestId('base-checkin-inherits')).toBeInTheDocument()
    expect(screen.getByTestId('location-picker-mock')).toHaveAttribute('data-radius', '25')
  })

  it('sends the method and radius when saving', async () => {
    const user = userEvent.setup()
    let body: Record<string, unknown> = {}
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Base Alpha', checkInMethod: 'LOCATION' }),
        ]),
      ),
      http.put('/api/games/:gameId/bases/:baseId', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(createMockBase({ id: 'base-1' }))
      }),
    )
    renderBaseDetail()

    const radius = await screen.findByTestId('base-checkin-radius')
    await user.clear(radius)
    await user.type(radius, '60')
    await user.click(await screen.findByTestId('save-base-btn'))

    await waitFor(() => {
      expect(body.checkInMethod).toBe('LOCATION')
    })
    expect(body.checkInRadiusM).toBe(60)
  })

  it('refuses to save unparseable coordinates instead of falling back to 0,0', async () => {
    const user = userEvent.setup()
    let putCalls = 0
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([createMockBase({ id: 'base-1', name: 'Base Alpha' })]),
      ),
      http.put('/api/games/:gameId/bases/:baseId', () => {
        putCalls += 1
        return HttpResponse.json(createMockBase({ id: 'base-1' }))
      }),
    )
    renderBaseDetail()

    const latInput = await screen.findByTestId('base-lat-input')
    await user.clear(latInput)
    await user.type(latInput, 'not-a-number')

    expect(await screen.findByTestId('base-coordinates-error')).toBeInTheDocument()
    expect(screen.getByTestId('save-base-btn')).toBeDisabled()
    await user.click(screen.getByTestId('save-base-btn'))
    expect(putCalls).toBe(0)
  })

})
