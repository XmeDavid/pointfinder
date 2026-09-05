import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocationStore } from '@/app/player/locationStore'
import { LocationCheckInPanel } from './LocationCheckInPanel'

const BASE = { lat: 40.09, lng: -8.87, radiusM: 20 }

function setLocation(state: Partial<ReturnType<typeof useLocationStore.getState>>) {
  useLocationStore.setState({ fix: null, heading: null, status: 'watching', claimable: {}, dwell: {}, ...state })
}

function renderPanel(props: Partial<React.ComponentProps<typeof LocationCheckInPanel>> = {}) {
  return render(<LocationCheckInPanel baseId="b1" base={BASE} onClaim={() => {}} claimable={false} busy={false} {...props} />)
}

beforeEach(() => setLocation({}))

describe('LocationCheckInPanel', () => {
  it('says it is locating before the first fix', () => {
    setLocation({ status: 'requesting' })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent('Finding your position…')
  })

  it('offers the settings screen when permission was denied', async () => {
    const geolocation = await import('@/platform/geolocation')
    const open = vi.spyOn(geolocation, 'openLocationSettings').mockResolvedValue()
    setLocation({ status: 'denied' })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent("Location is off, so this base can't unlock.")
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(open).toHaveBeenCalledOnce()
  })

  it('reports the distance while far away', () => {
    setLocation({ fix: { lat: 40.098, lng: -8.87, accuracy: 8, capturedAt: Date.now() } })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent(/About \d+ m away/)
  })

  it('explains a close but inexact fix', () => {
    setLocation({ fix: { lat: 40.0903, lng: -8.87, accuracy: 90, capturedAt: Date.now() } })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent("You're close. GPS accuracy ±90 m, move into the open")
  })

  it('confirms arrival once the fix is accepted', () => {
    setLocation({ fix: { lat: 40.09, lng: -8.87, accuracy: 6, capturedAt: Date.now() } })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent("You're at the base.")
  })

  it('reports an unavailable sensor', () => {
    setLocation({ status: 'unavailable' })
    renderPanel()
    expect(screen.getByTestId('player-location-panel')).toHaveTextContent("This phone can't report a position right now.")
  })

  it('keeps the claim disabled with a hint until the dwell rule is met', () => {
    setLocation({ fix: { lat: 40.0903, lng: -8.87, accuracy: 90, capturedAt: Date.now() } })
    renderPanel({ claimable: false })
    expect(screen.getByTestId('player-im-here-btn')).toBeDisabled()
    expect(screen.getByText('Stay near the base for a minute to enable this.')).toBeInTheDocument()
  })

  it('claims presence once the dwell rule is met', async () => {
    const onClaim = vi.fn()
    setLocation({ fix: { lat: 40.0903, lng: -8.87, accuracy: 90, capturedAt: Date.now() } })
    renderPanel({ claimable: true, onClaim })
    const button = screen.getByTestId('player-im-here-btn')
    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(onClaim).toHaveBeenCalledOnce()
  })

  it('disables the claim while a check-in is in flight', () => {
    setLocation({ fix: { lat: 40.0903, lng: -8.87, accuracy: 90, capturedAt: Date.now() } })
    renderPanel({ claimable: true, busy: true })
    expect(screen.getByTestId('player-im-here-btn')).toBeDisabled()
  })
})
