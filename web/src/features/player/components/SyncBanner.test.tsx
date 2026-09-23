import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PendingAction } from '@pointfinder/game-core'
import { SyncBanner } from './SyncBanner'

const base = { gameId: 'g1', baseId: 'b1', createdAt: '2026-09-05T10:00:00Z', attempts: 0, nextAttemptAt: 0 }

describe('SyncBanner', () => {
  it('shows how much of each queued photo or video has been sent (OW-10)', () => {
    const pending: PendingAction[] = [{
      ...base, id: 's1', type: 'submission', state: 'pending', challengeId: 'c1', answer: '',
      media: [
        { id: 'm1', name: 'team.jpg', contentType: 'image/jpeg', size: 2000, uploadedBytes: 1000 },
        { id: 'm2', name: 'clip.mp4', contentType: 'video/mp4', size: 5000, uploadedBytes: 0 },
        { id: 'm3', name: 'done.jpg', contentType: 'image/jpeg', size: 10, uploadedBytes: 10, fileUrl: '/uploads/done.jpg' },
      ],
    }]
    render(<SyncBanner fromCache={false} pending={pending} needsAuth={false} onRetry={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByText('1 action waiting to sync')).toBeInTheDocument()
    const bars = screen.getAllByRole('progressbar')
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['50', '0', '100'])
    expect(screen.getByRole('progressbar', { name: 'team.jpg: 50% sent' })).toBeInTheDocument()
    expect(screen.getByTestId('upload-m2')).toHaveTextContent('Waiting to send')
    expect(screen.getByTestId('upload-m3')).toHaveTextContent('Sent')
  })

  it('explains a refused answer in the player’s language, not the server’s wording', () => {
    const pending: PendingAction[] = [{
      ...base, id: 's2', type: 'submission', state: 'failed', challengeId: 'c1', answer: '', selectedOptionIds: ['o1'],
      lastError: 'This team already answered this challenge', lastErrorCode: 'CHOICE_ALREADY_ANSWERED',
    }]
    render(<SyncBanner fromCache={false} pending={pending} needsAuth={false} onRetry={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByText('Your team already answered this one.')).toBeInTheDocument()
    expect(screen.queryByText('This team already answered this challenge')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
  })
})
