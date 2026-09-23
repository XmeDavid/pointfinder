import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ExploreGameResponse } from '@pointfinder/api'
import { DiscoveryCard } from './DiscoveryCard'

const listing: ExploreGameResponse = {
  gameId: 'g1', title: 'Coastal trail', summary: 'Follow the cliffs', place: 'Nazaré', lat: null, lng: null, category: 'coast',
  organizer: 'Scouts', contentLanguage: 'pt', gameStatus: 'live', admission: 'open', joinable: true, featured: false,
  startDate: null, endDate: null, publishedAt: '2026-09-01T10:00:00Z', distanceKm: null, joined: false, playerId: null,
}

describe('DiscoveryCard', () => {
  it('shows the content language so players can judge whether they can follow the game', () => {
    render(<DiscoveryCard game={listing} onSelect={vi.fn()} />)
    expect(screen.getByTestId('content-language')).toHaveTextContent('Content language: Portuguese')
  })

  it('stays quiet about an unknown language on the compact card', () => {
    render(<DiscoveryCard game={{ ...listing, contentLanguage: null }} onSelect={vi.fn()} />)
    expect(screen.queryByTestId('content-language')).not.toBeInTheDocument()
  })
})
