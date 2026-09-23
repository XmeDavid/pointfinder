import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import type { PublicationReportResponse } from '@pointfinder/api'
import { server } from '@/test/msw/server'
import { AdminReports } from './AdminReports'

const report = (over: Partial<PublicationReportResponse>): PublicationReportResponse => ({
  id: 'r1', gameId: 'g1', gameName: 'Coast trail', listed: true, reason: 'unsafe', details: 'Crosses a motorway',
  reporterName: 'Ana', createdAt: '2026-09-20T10:00:00Z', ...over,
})

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('AdminReports (OW-06)', () => {
  function fixture(initial: PublicationReportResponse[]) {
    let rows = initial
    const calls: string[] = []
    server.use(
      http.get('/api/admin/publications/reports', () => HttpResponse.json(rows)),
      http.post('/api/admin/publications/:gameId/reports/:action', ({ params }) => {
        calls.push(`${params.action}:${params.gameId}`)
        rows = rows.filter((r) => r.gameId !== params.gameId)
        return params.action === 'remove' ? HttpResponse.json({ gameId: params.gameId, listed: false }) : new HttpResponse(null, { status: 204 })
      }),
    )
    return calls
  }

  it('groups open reports by game with each reason, detail and reporter', async () => {
    fixture([
      report({}),
      report({ id: 'r2', reason: 'misleading', details: null, reporterName: 'Rui' }),
      report({ id: 'r3', gameId: 'g2', gameName: 'Old forest', listed: false, reason: 'spam', details: null }),
    ])
    renderWithClient(<AdminReports />)
    const coast = await screen.findByTestId('admin-report-group-g1')
    expect(within(coast).getByText('Coast trail')).toBeInTheDocument()
    expect(within(coast).getByText('2 reports')).toBeInTheDocument()
    expect(within(coast).getByText('Unsafe place or activity')).toBeInTheDocument()
    expect(within(coast).getByText('Crosses a motorway')).toBeInTheDocument()
    expect(within(coast).getByText('Misleading or not a real game')).toBeInTheDocument()
    expect(within(coast).getByText(/^Rui, /)).toBeInTheDocument()
    const forest = screen.getByTestId('admin-report-group-g2')
    expect(within(forest).getByText('No longer listed')).toBeInTheDocument()
    // A game that is no longer listed can only have its reports closed.
    expect(within(forest).queryByTestId('admin-report-remove-g2')).not.toBeInTheDocument()
    expect(within(forest).getByTestId('admin-report-dismiss-g2')).toBeInTheDocument()
  })

  it('dismisses a game\'s reports and keeps the listing', async () => {
    const calls = fixture([report({})])
    renderWithClient(<AdminReports />)
    await userEvent.click(await screen.findByTestId('admin-report-dismiss-g1'))
    await waitFor(() => expect(calls).toEqual(['dismiss:g1']))
    expect(await screen.findByText('No open reports.')).toBeInTheDocument()
  })

  it('removes a reported listing only after confirming', async () => {
    const calls = fixture([report({})])
    renderWithClient(<AdminReports />)
    await userEvent.click(await screen.findByTestId('admin-report-remove-g1'))
    expect(await screen.findByRole('dialog', { name: 'Remove Coast trail from Explore?' })).toBeInTheDocument()
    expect(calls).toEqual([])
    await userEvent.click(screen.getByTestId('confirm-action-btn'))
    await waitFor(() => expect(calls).toEqual(['remove:g1']))
    expect(await screen.findByText('No open reports.')).toBeInTheDocument()
  })

  it('says when an action fails and keeps the reports', async () => {
    fixture([report({})])
    server.use(http.post('/api/admin/publications/:gameId/reports/dismiss', () => HttpResponse.json({ message: 'no' }, { status: 500 })))
    renderWithClient(<AdminReports />)
    await userEvent.click(await screen.findByTestId('admin-report-dismiss-g1'))
    expect(await screen.findByRole('alert')).toHaveTextContent('The change did not go through. Try again.')
    expect(screen.getByTestId('admin-report-group-g1')).toBeInTheDocument()
  })

  it('offers a retry when reports fail to load', async () => {
    server.use(http.get('/api/admin/publications/reports', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    renderWithClient(<AdminReports />)
    expect(await screen.findByText('Could not load reports.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry|Try again/ })).toBeInTheDocument()
  })
})

describe('AdminPanel reports tab (OW-06)', () => {
  it('shows the open-report count and opens the review', async () => {
    const { AdminPanel } = await import('./AdminPanel')
    server.use(http.get('/api/admin/publications/reports', () => HttpResponse.json([
      report({}), report({ id: 'r2' }), report({ id: 'r3', gameId: 'g2', gameName: 'Old forest' }),
    ])))
    renderWithClient(<AdminPanel />)
    expect(await screen.findByTestId('admin-reports-count')).toHaveTextContent('3')
    await userEvent.click(screen.getByTestId('admin-tab-reports'))
    expect(await screen.findByTestId('admin-report-group-g2')).toBeInTheDocument()
  })
})
