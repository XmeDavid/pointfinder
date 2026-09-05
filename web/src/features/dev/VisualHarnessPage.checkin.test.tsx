import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VisualHarnessPage } from './VisualHarnessPage'

vi.mock('@/components/map/LocationPicker', () => ({
  LocationPicker: () => <div data-testid="location-picker-mock" />,
}))

describe('VisualHarnessPage check-in scenario', () => {
  it('previews every method badge, the claim badge and a QR code', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VisualHarnessPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const section = screen.getByTestId('harness-checkin-methods')
    expect(section).toHaveTextContent('NFC')
    expect(section).toHaveTextContent('QR code')
    expect(section).toHaveTextContent('Location')
    expect(section).toHaveTextContent('Claimed')
    expect(section).toHaveTextContent('Operator')
    expect(section.querySelector('[data-testid="harness-qr"]')).toBeInTheDocument()
  })
})
