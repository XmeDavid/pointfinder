import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { AdminRealtime } from './AdminRealtime'

function renderWith(body: unknown, status = 200) {
  server.use(http.get('/api/admin/realtime/dead-letters', () => HttpResponse.json(body, { status })))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AdminRealtime /></QueryClientProvider>)
}

describe('AdminRealtime (OW-23)', () => {
  it('lists failed realtime events, newest first, read-only', async () => {
    renderWith({
      total: 3,
      items: [{
        outboxId: 42, instanceId: 'api-1', gameId: 'g-1', audience: 'operators', teamId: null, eventType: 'game_config',
        payload: '{"entity":"resources"}', attempts: 4, lastError: 'Broken pipe', createdAt: '2026-09-24T10:00:00Z', deadLetteredAt: '2026-09-24T10:30:00Z',
      }],
    })
    expect(await screen.findByText('3 failed events kept')).toBeInTheDocument()
    const row = screen.getByTestId('admin-dead-letter-42')
    expect(row).toHaveTextContent('game_config')
    expect(row).toHaveTextContent('api-1')
    expect(row).toHaveTextContent('Broken pipe')
    expect(screen.getByText(/nothing needs replaying/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument()
  })

  it('says when there is nothing to look at', async () => {
    renderWith({ total: 0, items: [] })
    expect(await screen.findByText('No failed realtime events.')).toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    renderWith({ message: 'down' }, 500)
    expect(await screen.findByText('Could not load failed realtime events.')).toBeInTheDocument()
  })
})
