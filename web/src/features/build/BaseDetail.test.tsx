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
  openBaseChallenge: vi.fn(),
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

  it('opens the linked challenge from the assignment section', async () => {
    const user = userEvent.setup()
    renderBaseDetail()

    await waitFor(() => {
      expect(screen.getByTestId('link-challenge-btn')).toHaveValue('challenge-1')
    })

    await user.click(screen.getByTestId('open-linked-challenge-btn'))
    expect(mockStore.openBaseChallenge).toHaveBeenCalledWith('base-1', 'challenge-1')
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
    expect(screen.getByTestId('base-checkin-method')).toBeInTheDocument()
    expect(screen.queryByTestId('base-lat-input')).not.toBeInTheDocument()
  })

  it('reveals precise coordinates without hiding the map or check-in method', async () => {
    const user = userEvent.setup()
    renderBaseDetail()

    const toggle = await screen.findByTestId('base-precise-coordinates-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('base-lat-input')).toBeInTheDocument()
    expect(screen.getByTestId('base-lng-input')).toBeInTheDocument()
    expect(screen.getByTestId('location-picker-mock')).toBeInTheDocument()
    expect(screen.getByTestId('base-checkin-method')).toBeInTheDocument()
  })

  it('renders tags section', async () => {
    renderBaseDetail()
    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })
    expect(screen.getByText('Tags').closest('details')).toBeNull()
    expect(screen.getByTestId('visibility-visible').closest('details')).toBeNull()
  })

  it('keeps unset fixed-challenge rules out of the common flow', async () => {
    renderBaseDetail()
    await screen.findByTestId('base-name-input')
    expect(screen.queryByText('Fixed Challenge')).not.toBeInTheDocument()
    expect(screen.getByTestId('base-assignment-section')).toBeInTheDocument()
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

    await user.click(await screen.findByTestId('base-precise-coordinates-toggle'))
    const latInput = await screen.findByTestId('base-lat-input')
    await user.clear(latInput)
    await user.type(latInput, 'not-a-number')

    expect(await screen.findByTestId('base-coordinates-error')).toBeInTheDocument()
    expect(screen.getByTestId('save-base-btn')).toBeDisabled()
    await user.click(screen.getByTestId('save-base-btn'))
    expect(putCalls).toBe(0)
  })

})

describe('BaseDetail tutorial anchors', () => {
  it('exposes the draft visibility as aria-pressed on both buttons', async () => {
    const user = userEvent.setup()
    renderBaseDetail()

    const visible = await screen.findByTestId('visibility-visible')
    const hidden = screen.getByTestId('visibility-hidden')
    expect(visible).toHaveAttribute('aria-pressed', 'true')
    expect(hidden).toHaveAttribute('aria-pressed', 'false')

    await user.click(hidden)

    // The draft flips immediately, before any save.
    expect(screen.getByTestId('visibility-hidden')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('visibility-visible')).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('BaseDetail location check-in entitlement', () => {
  function gameHandler(locationCheckInAllowed: boolean | undefined) {
    server.use(
      http.get('/api/games/:id', ({ params }) =>
        HttpResponse.json(
          createMockGame({
            id: String(params.id),
            ...(locationCheckInAllowed === undefined ? {} : { locationCheckInAllowed }),
          }),
        ),
      ),
    )
  }

  it('locks the location method and explains the plan when the game excludes it', async () => {
    const user = userEvent.setup()
    gameHandler(false)
    renderBaseDetail()

    const location = await screen.findByTestId('base-checkin-method-location')
    await waitFor(() => expect(location).toHaveAttribute('aria-disabled', 'true'))
    expect(location).toHaveAttribute('aria-describedby', 'base-checkin-location-plan')
    expect(screen.getByTestId('base-checkin-location-plan')).toHaveTextContent(
      'Location check-in is part of paid plans',
    )
    expect(screen.getByTestId('base-checkin-method-qr')).not.toHaveAttribute('aria-disabled')
    expect(screen.getByTestId('base-checkin-method-nfc')).not.toHaveAttribute('aria-disabled')

    // The lock holds: clicking does not switch the draft.
    await user.click(location)
    expect(location).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the full picker when the game includes location', async () => {
    gameHandler(true)
    renderBaseDetail()

    const location = await screen.findByTestId('base-checkin-method-location')
    await waitFor(() => expect(screen.getByTestId('base-name-input')).toHaveValue('Base Alpha'))
    expect(location).not.toHaveAttribute('aria-disabled')
    expect(screen.queryByTestId('base-checkin-location-plan')).toBeNull()
  })

  it('keeps the full picker when the server predates the entitlement', async () => {
    gameHandler(undefined)
    renderBaseDetail()

    const location = await screen.findByTestId('base-checkin-method-location')
    await waitFor(() => expect(screen.getByTestId('base-name-input')).toHaveValue('Base Alpha'))
    expect(location).not.toHaveAttribute('aria-disabled')
    expect(screen.queryByTestId('base-checkin-location-plan')).toBeNull()
  })
})
