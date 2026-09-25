import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import type { GamePublicationResponse } from '@pointfinder/api'
import { server } from '@/test/msw/server'
import { AdminPublications } from './AdminPublications'
import { AdminPanel } from './AdminPanel'

const publication = (over: Partial<GamePublicationResponse>): GamePublicationResponse => ({
  gameId: 'g1', gameName: 'Coast', gameStatus: 'live', organizer: 'Scouts', contentLanguage: 'pt', title: 'Coast trail',
  summary: 'Cliffs', place: 'Nazaré', lat: null, lng: null, category: 'coast', admissionTeamId: null, admissionTeamName: null,
  listed: true, publishedAt: '2026-09-01T10:00:00Z', publishedById: 'u1', publishedByName: 'Ana', featured: false, featuredAt: null,
  updatedAt: '2026-09-01T10:00:00Z', moderationHold: false, ...over,
})

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('AdminPublications (OW-06)', () => {
  function fixture() {
    let rows = [publication({}), publication({ gameId: 'g2', title: 'Draft forest', listed: false, publishedAt: null })]
    const calls: string[] = []
    server.use(
      http.get('/api/admin/publications', () => HttpResponse.json(rows)),
      http.post('/api/admin/publications/:gameId/:action', ({ params }) => {
        calls.push(`${params.action}:${params.gameId}`)
        const change: Partial<GamePublicationResponse> =
          params.action === 'remove' ? { listed: false, featured: false, publishedAt: null, moderationHold: true }
            : params.action === 'release' ? { moderationHold: false }
              : { featured: params.action === 'feature' }
        rows = rows.map((r) => (r.gameId === params.gameId ? { ...r, ...change } : r))
        return HttpResponse.json(rows.find((r) => r.gameId === params.gameId))
      }),
      http.post('/api/games/:gameId/publication/unpublish', ({ params }) => {
        calls.push(`unpublish:${params.gameId}`)
        rows = rows.map((r) => (r.gameId === params.gameId ? { ...r, listed: false, featured: false, publishedAt: null } : r))
        return HttpResponse.json(rows.find((r) => r.gameId === params.gameId))
      }),
    )
    return calls
  }

  it('lists listed games first, features one and shows drafts on request', async () => {
    const user = userEvent.setup()
    const calls = fixture()
    renderWithClient(<AdminPublications />)
    const row = await screen.findByTestId('admin-publication-g1')
    expect(row).toHaveTextContent('Coast trail')
    expect(row).toHaveTextContent('Content language: Portuguese')
    expect(screen.queryByTestId('admin-publication-g2')).not.toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Feature' }))
    await waitFor(() => expect(within(screen.getByTestId('admin-publication-g1')).getByText('Featured')).toBeInTheDocument())
    expect(calls).toEqual(['feature:g1'])
    await user.click(screen.getByRole('switch', { name: 'Listed only' }))
    expect(screen.getByTestId('admin-publication-g2')).toHaveTextContent('Draft')
    expect(within(screen.getByTestId('admin-publication-g2')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('removes a listing from Explore only after confirmation', async () => {
    const user = userEvent.setup()
    const calls = fixture()
    renderWithClient(<AdminPublications />)
    await user.click(within(await screen.findByTestId('admin-publication-g1')).getByRole('button', { name: 'Remove from Explore' }))
    expect(screen.getByRole('dialog', { name: 'Remove Coast trail from Explore?' })).toBeInTheDocument()
    expect(calls).toEqual([])
    await user.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(calls).toEqual(['remove:g1']))
    await waitFor(() => expect(screen.queryByTestId('admin-publication-g1')).not.toBeInTheDocument())
  })

  it('holds a removed listing until an admin allows it again (owner decision 2026-09-24)', async () => {
    const user = userEvent.setup()
    const calls = fixture()
    renderWithClient(<AdminPublications />)
    await user.click(within(await screen.findByTestId('admin-publication-g1')).getByRole('button', { name: 'Remove from Explore' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('cannot list it again until an administrator allows it')
    await user.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(calls).toEqual(['remove:g1']))
    await user.click(screen.getByRole('switch', { name: 'Listed only' }))
    const row = await screen.findByTestId('admin-publication-g1')
    expect(row).toHaveTextContent('On hold')
    await user.click(within(row).getByRole('button', { name: 'Allow listing again' }))
    await waitFor(() => expect(calls).toEqual(['remove:g1', 'release:g1']))
    await waitFor(() => expect(screen.getByTestId('admin-publication-g1')).not.toHaveTextContent('On hold'))
  })
})

describe('AdminPanel', () => {
  it('offers a way back to the games (root TODO)', () => {
    server.use(http.get('/api/admin/users', () => HttpResponse.json({ content: [], totalElements: 0 })))
    renderWithClient(<AdminPanel />)
    expect(screen.getByRole('link', { name: 'Back to games' })).toHaveAttribute('href', '/dashboard?view=organize')
  })
})
