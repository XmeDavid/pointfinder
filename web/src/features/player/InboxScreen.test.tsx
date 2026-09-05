import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderPlayer } from '@/features/player/test/renderPlayer'
import InboxScreen from './InboxScreen'
import { relativeTime } from './relativeTime'

describe('InboxScreen', () => {
  it('lists operator messages newest first and marks them seen', async () => {
    const seen = vi.fn()
    server.use(http.post('/api/player/notifications/mark-seen', () => { seen(); return new HttpResponse(null, { status: 204 }) }))
    await renderPlayer(<InboxScreen />)
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Falcons, your photo at the boulder was great!')
    expect(items[1]).toHaveTextContent('Lunch is at the chapel at 12:30.')
    await waitFor(() => expect(seen).toHaveBeenCalledTimes(1))
  })

  it('shows an empty state without calling mark-seen', async () => {
    const seen = vi.fn()
    server.use(
      http.get('/api/player/notifications', () => HttpResponse.json([])),
      http.post('/api/player/notifications/mark-seen', () => { seen(); return new HttpResponse(null, { status: 204 }) }),
    )
    await renderPlayer(<InboxScreen />)
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
    expect(seen).not.toHaveBeenCalled()
  })

  it('offers a retry when loading fails', async () => {
    server.use(http.get('/api/player/notifications', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    await renderPlayer(<InboxScreen />)
    expect(await screen.findByText("Couldn't load notifications.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('formats times relative to now', () => {
    const now = Date.parse('2026-09-05T12:00:00Z')
    expect(relativeTime('2026-09-05T11:59:40Z', now, 'en', 'Just now')).toBe('Just now')
    expect(relativeTime('2026-09-05T11:30:00Z', now, 'en', 'Just now')).toBe('30 minutes ago')
    expect(relativeTime('2026-09-04T12:00:00Z', now, 'en', 'Just now')).toBe('yesterday')
  })
})
