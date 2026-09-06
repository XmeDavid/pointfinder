import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase, resetBaseCounter } from '@/test/factories/base'
import { createMockGame } from '@/test/factories/game'
import NfcTagsPage from './NfcTagsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/game/g1/nfc']}>
        <Routes><Route path="/game/:id/nfc" element={<NfcTagsPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Codes encode the tag URL, which needs a real base UUID. */
const QR_BASE_ID = '0d2f1c9e-0000-4000-8000-000000000002'

describe('NfcTagsPage', () => {
  it('lists unlinked bases first and filters by link state', async () => {
    resetBaseCounter()
    const linked = createMockBase({ name: 'Chapel', nfcLinked: true })
    const missing = createMockBase({ name: 'Old mill', nfcLinked: false })
    server.use(http.get('/api/games/:gameId/bases', () => HttpResponse.json([linked, missing])))
    renderPage()
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Old mill')
    expect(items[1]).toHaveTextContent('Chapel')
    await userEvent.click(screen.getByRole('tab', { name: 'Linked' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveTextContent('Chapel')
  })

  it('explains that writing needs the phone app when running in a browser', async () => {
    server.use(http.get('/api/games/:gameId/bases', () => HttpResponse.json([createMockBase({ name: 'Chapel', nfcLinked: false })])))
    renderPage()
    expect(await screen.findByText('NFC writing needs the phone app.')).toBeInTheDocument()
    expect(screen.queryByTestId(/nfc-write-/)).not.toBeInTheDocument()
  })

  it('shows an empty state for a game without bases', async () => {
    server.use(http.get('/api/games/:gameId/bases', () => HttpResponse.json([])))
    renderPage()
    expect(await screen.findByText('This game has no bases yet.')).toBeInTheDocument()
  })

  it('renders each base according to its check-in method', async () => {
    resetBaseCounter()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', name: 'Chapel', checkInMethod: 'NFC', nfcLinked: true }),
          createMockBase({ id: QR_BASE_ID, name: 'Old mill', checkInMethod: 'QR', nfcToken: 'ab12cd34' }),
          createMockBase({
            id: 'b3',
            name: 'Fountain',
            checkInMethod: 'LOCATION',
            checkInRadiusM: 40,
          }),
        ]),
      ),
    )
    renderPage()

    expect(await screen.findByTestId('nfc-base-b1')).toHaveTextContent('NFC linked')
    expect(screen.getByTestId(`codes-qr-${QR_BASE_ID}`)).toBeInTheDocument()
    expect(screen.getByTestId('nfc-base-b3')).toHaveTextContent(
      'No tag needed — this base unlocks by location.',
    )
    expect(screen.getByTestId('nfc-base-b3')).toHaveTextContent('40')
  })

  it('filters the list by check-in method', async () => {
    resetBaseCounter()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', name: 'Chapel', checkInMethod: 'NFC' }),
          createMockBase({ id: 'b2', name: 'Old mill', checkInMethod: 'QR' }),
        ]),
      ),
    )
    renderPage()

    await screen.findByTestId('nfc-base-b1')
    await userEvent.click(screen.getByTestId('codes-method-qr'))

    expect(screen.queryByTestId('nfc-base-b1')).not.toBeInTheDocument()
    expect(screen.getByTestId('nfc-base-b2')).toBeInTheDocument()
  })

  it('prints one page per QR base with the base and game name', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    resetBaseCounter()
    server.use(
      http.get('/api/games/:id', () =>
        HttpResponse.json(createMockGame({ id: 'g1', name: 'Night Trail' })),
      ),
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({ id: 'b1', name: 'Chapel', checkInMethod: 'NFC' }),
          createMockBase({ id: 'b2', name: 'Old mill', checkInMethod: 'QR', nfcToken: 'ab12cd34' }),
          createMockBase({ id: 'b3', name: 'Fountain', checkInMethod: 'QR', nfcToken: 'ef56gh78' }),
        ]),
      ),
    )
    renderPage()

    await userEvent.click(await screen.findByTestId('codes-print-all'))

    const pages = await screen.findAllByTestId('codes-print-page')
    expect(pages).toHaveLength(2)
    expect(pages[0]).toHaveTextContent('Night Trail')
    expect(print).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('disables print-all when no base uses a QR code', async () => {
    resetBaseCounter()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([createMockBase({ id: 'b1', name: 'Chapel', checkInMethod: 'NFC' })]),
      ),
    )
    renderPage()

    expect(await screen.findByTestId('codes-print-all')).toBeDisabled()
  })


  it('renders rows from a backend that predates check-in methods as NFC bases', async () => {
    resetBaseCounter()
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          { id: 'b1', gameId: 'g1', name: 'Chapel', description: '', lat: 1, lng: 2, nfcLinked: true, nfcToken: 'ab12cd34', hidden: false },
        ]),
      ),
    )
    renderPage()

    expect(await screen.findByTestId('nfc-base-b1')).toHaveTextContent('Chapel')
    expect(screen.getByTestId('nfc-base-b1')).toHaveTextContent('NFC linked')
  })

})
