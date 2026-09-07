import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VisualHarnessPage } from './VisualHarnessPage'

vi.mock('@/components/map/LocationPicker', () => ({
  LocationPicker: () => <div data-testid="location-picker-mock" />,
}))

describe('VisualHarnessPage tutorial scenario', () => {
  it('previews the coach bubble states and the collapsed pill', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VisualHarnessPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const section = screen.getByTestId('harness-tutorials')
    expect(section).toHaveTextContent('Place your first base')
    expect(section).toHaveTextContent('Basis hier platzieren')
    expect(section).toHaveTextContent('Players never see scores.')
    expect(section).toHaveTextContent("I'll do it later")
    expect(section).toHaveTextContent('Tutorial')
    expect(section.querySelectorAll('[role="progressbar"]').length).toBeGreaterThan(0)
    expect(section.querySelectorAll('[data-testid="tour-bubble"]')).toHaveLength(4)
  })
})
