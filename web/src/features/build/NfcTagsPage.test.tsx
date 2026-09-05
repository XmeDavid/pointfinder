import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockBase, resetBaseCounter } from '@/test/factories/base'
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
})
