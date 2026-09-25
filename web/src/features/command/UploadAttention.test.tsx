import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { UploadAttention } from './UploadAttention'

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function renderWith(rows: unknown[]) {
  server.use(http.get('/api/games/:gameId/uploads/attention', () => HttpResponse.json(rows)))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><UploadAttention gameId="game-1" /></QueryClientProvider>)
}

describe('UploadAttention (OW-18)', () => {
  it('tells the operator which team to contact and what to say', async () => {
    renderWith([
      { sessionId: 's1', kind: 'stalled', teamId: 't1', teamName: 'Falcons', playerName: 'Ana', fileName: 'photo.jpg', totalBytes: 4000, receivedBytes: 1000, since: minutesAgo(45) },
      { sessionId: 's2', kind: 'unlinked', teamId: 't2', teamName: 'Owls', playerName: 'Rui', fileName: 'clip.mp4', totalBytes: 9000, receivedBytes: 9000, since: minutesAgo(20) },
    ])
    const toggle = await screen.findByRole('button', { name: /2 uploads need attention/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(screen.getByTestId('upload-attention-s1')).toHaveTextContent('Falcons · Ana')
    expect(screen.getByTestId('upload-attention-s1')).toHaveTextContent('photo.jpg: 25% sent, nothing new for 45 min')
    expect(screen.getByTestId('upload-attention-s2')).toHaveTextContent('clip.mp4 arrived, but its answer was not sent')
    expect(screen.getByText(/The files are safe on the player's phone/)).toBeInTheDocument()
  })

  it('shows nothing when no upload needs attention', async () => {
    const { container } = renderWith([])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(container).toBeEmptyDOMElement()
  })
})
